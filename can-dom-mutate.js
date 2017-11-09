'use strict';

var push = Array.prototype.push;
var domData = require('can-dom-data-state');
var CIDMap = require('can-cid/map/map');
var globals = require('can-globals');
var getRoot = require('can-globals/global/global');
var getMutationObserver = require('can-globals/mutation-observer/mutation-observer');
var setImmediate = getRoot().setImmediate || function (cb) {
	return setTimeout(cb, 0);
};

var util = require('./-util');
var getDocument = util.getDocument;
var eliminate = util.eliminate;
var subscription = util.subscription;
var isDocumentElement = util.isDocumentElement;
var getAllNodes = util.getAllNodes;

var domMutate;

function batch(processBatchItems, shouldDeduplicate) {
	var waitingBatch = [];
	var waitingCalls = [];
	var dispatchMap = new CIDMap();
	var isPrimed = false;
	return function batchAdd(items, callback) {
		if (shouldDeduplicate) {
			for (var i = 0; i < items.length; i++) {
				var item = items[i];
				var target = item.target;
				if (!dispatchMap.get(target)) {
					waitingBatch.push(item);
					dispatchMap.set(target, true);
				}
			}
		} else {
			push.apply(waitingBatch, items);
		}
		if (callback) {
			waitingCalls.push(callback);
		}

		var shouldPrime = !isPrimed && waitingBatch.length > 0;
		if (shouldPrime) {
			isPrimed = true;
			setImmediate(function processBatch() {
				var currentBatch = waitingBatch;
				waitingBatch = [];
				var currentCalls = waitingCalls;
				waitingCalls = [];
				dispatchMap.clear();
				isPrimed = false;
				processBatchItems(currentBatch);
				currentCalls.forEach(function (callback) {
					callback();
				});
			});
		}
	};
}

function getDocumentListeners (target, key) {
	var doc = getDocument(target);
	var data = domData.get.call(doc, key);
	if (data) {
		return data.listeners;
	}
}

function getTargetListeners (target, key) {
	var doc = getDocument(target);
	var targetListenersMap = domData.get.call(doc, key);
	if (!targetListenersMap) {
		return;
	}

	return targetListenersMap.get(target);
}

function addTargetListener (target, key, listener) {
	var doc = getDocument(target);
	var targetListenersMap = domData.get.call(doc, key);
	if (!targetListenersMap) {
		targetListenersMap = new CIDMap();
		domData.set.call(doc, key, targetListenersMap);
	}
	var targetListeners = targetListenersMap.get(target);
	if (!targetListeners) {
		targetListeners = [];
		targetListenersMap.set(target, targetListeners);
	}
	targetListeners.push(listener);
}

function removeTargetListener (target, key, listener) {
	var doc = getDocument(target);
	var targetListenersMap = domData.get.call(doc, key);
	if (!targetListenersMap) {
		return;
	}
	var targetListeners = targetListenersMap.get(target);
	if (!targetListeners) {
		return;
	}
	eliminate(targetListeners, listener);
	if (targetListeners.size === 0) {
		targetListenersMap['delete'](target);
		if (targetListenersMap.size === 0) {
			domData.clean.call(doc, key);
		}
	}
}

function dispatch(listenerKey, documentDataKey) {
	return function dispatchEvents(events) {
		for (var e = 0; e < events.length; e++) {
			var event = events[e];
			var target = event.target;

			var targetListeners = getTargetListeners(target, listenerKey);
			if (targetListeners) {
				for (var t = 0; t < targetListeners.length; t++) {
					targetListeners[t](event);
				}
			}

			if (!documentDataKey) {
				continue;
			}

			var documentListeners = getDocumentListeners(target, documentDataKey);
			if (documentListeners) {
				for (var l = 0; l < documentListeners.length; l++) {
					documentListeners[l](event);
				}
			}
		}
	};
}

function observeMutations(target, observerKey, config, handler) {
	var MutationObserver = getMutationObserver();
	if (!MutationObserver) {
		return function () {
		};
	}

	var observerData = domData.get.call(target, observerKey);
	if (!observerData) {
		var targetObserver = new MutationObserver(handler);
		targetObserver.observe(target, config);
		observerData = {
			observer: targetObserver,
			observingCount: 0
		};
		domData.set.call(target, observerKey, observerData);
	}

	observerData.observingCount++;
	return function stopObservingMutations() {
		var observerData = domData.get.call(target, observerKey);
		if (observerData) {
			observerData.observingCount--;
			if (observerData.observingCount <= 0) {
				observerData.observer.disconnect();
				domData.clean.call(target, observerKey);
			}
		}
	};
}

function observeMutations(target, observerKey, config, handler) {
	var observerData = domData.get.call(target, observerKey);
	if (!observerData) {
		observerData = {
			observingCount: 0
		};
		domData.set.call(target, observerKey, observerData);
	}

	var setupObserver = function () {
		var MutationObserver = getMutationObserver();
		if (MutationObserver) {
			var Node = getRoot().Node;
			var isRealNode = !!(Node && target instanceof Node);
			if (isRealNode) {
				var targetObserver = new MutationObserver(handler);
				targetObserver.observe(target, config);
				observerData.observer = targetObserver;
			}
		} else {
			if (observerData.observer) {
				observerData.observer.disconnect();
				observerData.observer = null;
			}
		}
	};

	if (observerData.observingCount === 0) {
		globals.onKeyValue('MutationObserver', setupObserver);
		setupObserver();
	}

	observerData.observingCount++;
	return function stopObservingMutations() {
		var observerData = domData.get.call(target, observerKey);
		if (observerData) {
			observerData.observingCount--;
			if (observerData.observingCount <= 0) {
				if (observerData.observer) {
					observerData.observer.disconnect();
				}
				domData.clean.call(target, observerKey);
				globals.offKeyValue('MutationObserver', setupObserver);
			}
		}
	};
}

function handleTreeMutations(mutations) {
	mutations.forEach(function (mutation) {
		var addedNodes = mutation.addedNodes;
		var addedCount = addedNodes.length;
		for (var a = 0; a < addedCount; a++) {
			domMutate.dispatchNodeInsertion(addedNodes[a]);
		}

		var removedNodes = mutation.removedNodes;
		var removedCount = removedNodes.length;
		for (var r = 0; r < removedCount; r++) {
			domMutate.dispatchNodeRemoval(removedNodes[r]);
		}
	});
}

function handleAttributeMutations(mutations) {
	mutations.forEach(function (mutation) {
		if (mutation.type === 'attributes') {
			var node = mutation.target;
			var attributeName = mutation.attributeName;
			var oldValue = mutation.oldValue;
			domMutate.dispatchNodeAttributeChange(node, attributeName, oldValue);
		}
	});
}

var treeMutationConfig = {
	subtree: true,
	childList: true
};

var attributeMutationConfig = {
	attributes: true,
	attributeOldValue: true
};

function addNodeListener(listenerKey, observerKey, isAttributes) {
	return subscription(function _addNodeListener(target, listener) {
		var stopObserving;
		if (isAttributes) {
			stopObserving = observeMutations(target, observerKey, attributeMutationConfig, handleAttributeMutations);
		} else {
			stopObserving = observeMutations(getDocument(target).documentElement, observerKey, treeMutationConfig, handleTreeMutations);
		}

		addTargetListener(target, listenerKey, listener);
		return function removeNodeListener() {
			stopObserving();
			removeTargetListener(target, listenerKey, listenerKey);
		};
	});
}

function addGlobalListener(globalDataKey, addNodeListener) {
	return subscription(function addGlobalGroupListener(documentElement, listener) {
		if (!isDocumentElement(documentElement)) {
			throw new Error('Global mutation listeners must pass a documentElement');
		}

		var doc = getDocument(documentElement);
		var documentData = domData.get.call(doc, globalDataKey);
		if (!documentData) {
			documentData = {listeners: []};
			domData.set.call(doc, globalDataKey, documentData);
		}

		var listeners = documentData.listeners;
		if (listeners.length === 0) {
			// We need at least on listener for mutation events to propagate
			documentData.removeListener = addNodeListener(doc, function () {});
		}

		listeners.push(listener);

		return function removeGlobalGroupListener() {
			var documentData = domData.get.call(doc, globalDataKey);
			if (!documentData) {
				return;
			}

			var listeners = documentData.listeners;
			eliminate(listeners, listener);
			if (listeners.length === 0) {
				documentData.removeListener();
				domData.clean.call(doc, globalDataKey);
			}
		};
	});
}

function toMutationEvents (nodes) {
	var events = [];
	for (var i = 0; i < nodes.length; i++) {
		events.push({target: nodes[i]});
	}
	return events;
}

var domMutationPrefix = 'domMutation';

// target listener keys
var insertionDataKey = domMutationPrefix + 'InsertionData';
var removalDataKey = domMutationPrefix + 'RemovalData';
var attributeChangeDataKey = domMutationPrefix + 'AttributeChangeData';

// document listener keys
var documentInsertionDataKey = domMutationPrefix + 'DocumentInsertionData';
var documentRemovalDataKey = domMutationPrefix + 'DocumentRemovalData';
var documentAttributeChangeDataKey = domMutationPrefix + 'DocumentAttributeChangeData';

// observer keys
var treeDataKey = domMutationPrefix + 'TreeData';
var attributeDataKey = domMutationPrefix + 'AttributeData';

var dispatchInsertion = batch(dispatch(insertionDataKey, documentInsertionDataKey), true);
var dispatchRemoval = batch(dispatch(removalDataKey, documentRemovalDataKey), true);
var dispatchAttributeChange = batch(dispatch(attributeChangeDataKey, documentAttributeChangeDataKey));

// node listeners
var addNodeInsertionListener = addNodeListener(insertionDataKey, treeDataKey);
var addNodeRemovalListener = addNodeListener(removalDataKey, treeDataKey);
var addNodeAttributeChangeListener = addNodeListener(attributeChangeDataKey, attributeDataKey, true);

// global listeners
var addInsertionListener = addGlobalListener(
	documentInsertionDataKey,
	addNodeRemovalListener
);
var addRemovalListener = addGlobalListener(
	documentRemovalDataKey,
	addNodeRemovalListener
);
var addAttributeChangeListener = addGlobalListener(
	documentAttributeChangeDataKey,
	addNodeAttributeChangeListener
);

/**
 * @module {{}} can-dom-mutate
 * @parent can-infrastructure
 * @description Dispatch and listen for DOM mutations.
 * @group can-dom-events.static 0 static
 * @group can-dom-events.events 1 events
 * @signature `domMutation`
 */
domMutate = {
	/**
	* @function can-dom-mutate.dispatchNodeInsertion dispatchNodeInsertion
	*
	* Dispatch an insertion mutation on the given node.
	*
	* @signature `dispatchNodeInsertion( node [, callback ] )`
	* @parent can-dom-mutate.static
	* @param {Node} node The node on which to dispatch an insertion mutation.
	* @param {function} callback The optional callback called after the mutation is dispatched.
	*/
	dispatchNodeInsertion: function (node, callback) {
		var events = toMutationEvents(getAllNodes(node));
		dispatchInsertion(events, callback);
	},

	/**
	* @function can-dom-mutate.dispatchNodeRemoval dispatchNodeRemoval
	*
	* Dispatch a removal mutation on the given node.
	*
	* @signature `dispatchNodeRemoval( node [, callback ] )`
	* @parent can-dom-mutate.static
	* @param {Node} node The node on which to dispatch a removal mutation.
	* @param {function} callback The optional callback called after the mutation is dispatched.
	*/
	dispatchNodeRemoval: function (node, callback) {
		var events = toMutationEvents(getAllNodes(node));
		dispatchRemoval(events, callback);
	},

	/**
	* @function can-dom-mutate.dispatchNodeAttributeChange dispatchNodeAttributeChange
	*
	* Dispatch an attribute change mutation on the given node.
	*
	* @signature `dispatchNodeAttributeChange( node, attributeName, oldValue [, callback ] )`
	* @parent can-dom-mutate.static
	* @param {Node} target The node on which to dispatch an attribute change mutation.
	* @param {String} attributeName The attribute name whose value has changed.
	* @param {String} oldValue The attribute value before the change.
	* @param {function} callback The optional callback called after the mutation is dispatched.
	*/
	dispatchNodeAttributeChange: function (target, attributeName, oldValue, callback) {
		dispatchAttributeChange([{
			target: target,
			attributeName: attributeName,
			oldValue: oldValue
		}], callback);
	},

	/**
	* @function can-dom-mutate.onNodeInsertion onNodeInsertion
	*
	* Listen for insertion mutations on the given node.
	*
	* @signature `onNodeInsertion( node, callback )`
	* @parent can-dom-mutate.static
	* @param {Node} node The node on which to listen for insertion mutations.
	* @param {function} callback The callback called when an insertion mutation is dispatched.
	* @return {function} The callback to remove the mutation listener.
	*/
	onNodeInsertion: addNodeInsertionListener,

	/**
	* @function can-dom-mutate.onNodeRemoval onNodeRemoval
	*
	* Listen for removal mutations on the given node.
	*
	* @signature `onNodeRemoval( node, callback )`
	* @parent can-dom-mutate.static
	* @param {Node} node The node on which to listen for removal mutations.
	* @param {function} callback The callback called when a removal mutation is dispatched.
	* @return {function} The callback to remove the mutation listener.
	*/
	onNodeRemoval: addNodeRemovalListener,

	/**
	* @function can-dom-mutate.onNodeAttributeChange onNodeAttributeChange
	*
	* Listen for attribute change mutations on the given node.
	*
	* @signature `onNodeAttributeChange( node, callback )`
	* @parent can-dom-mutate.static
	* @param {Node} node The node on which to listen for attribute change mutations.
	* @param {function} callback The callback called when an attribute change mutation is dispatched.
	* @return {function} The callback to remove the mutation listener.
	*/
	onNodeAttributeChange: addNodeAttributeChangeListener,

	/**
	* @function can-dom-mutate.onRemoval onRemoval
	*
	* Listen for removal mutations on any node within the documentElement.
	*
	* @signature `onRemoval( documentElement, callback )`
	* @parent can-dom-mutate.static
	* @param {Node} documentElement The documentElement on which to listen for removal mutations.
	* @param {function} callback The callback called when a removal mutation is dispatched.
	* @return {function} The callback to remove the mutation listener.
	*/
	onRemoval: addRemovalListener,

	/**
	* @function can-dom-mutate.onInsertion onInsertion
	*
	* Listen for insertion mutations on any node within the documentElement.
	*
	* @signature `onInsertion( documentElement, callback )`
	* @parent can-dom-mutate.static
	* @param {Node} documentElement The documentElement on which to listen for removal mutations.
	* @param {function} callback The callback called when a insertion mutation is dispatched.
	* @return {function} The callback to remove the mutation listener.
	*/
	onInsertion: addInsertionListener,

	/**
	* @function can-dom-mutate.onAttributeChange onAttributeChange
	*
	* Listen for attribute change mutations on any node within the documentElement.
	*
	* @signature `onAttributeChange( documentElement, callback )`
	* @parent can-dom-mutate.static
	* @param {Node} documentElement The documentElement on which to listen for removal mutations.
	* @param {function} callback The callback called when an attribute change mutation is dispatched.
	* @return {function} The callback to remove the mutation listener.
	*/
	onAttributeChange: addAttributeChangeListener
};

module.exports = domMutate;
