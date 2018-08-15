'use strict';

var globals = require('can-globals');
var getRoot = require('can-globals/global/global');
var getMutationObserver = require('can-globals/mutation-observer/mutation-observer');
var namespace = require('can-namespace');
var setImmediate = getRoot().setImmediate || function (cb) {
	return setTimeout(cb, 0);
};

var util = require('./-util');
var getDocument = util.getDocument;
var eliminate = util.eliminate;
var subscription = util.subscription;
var isDocumentElement = util.isDocumentElement;
var getAllNodes = util.getAllNodes;

var push = Array.prototype.push;
var slice = Array.prototype.slice;

var domMutate;
var dataStore = new WeakMap();

function getRelatedData(node, key) {
	var data = dataStore.get(node);
	if (data) {
		return data[key];
	}
}

function setRelatedData(node, key, targetListenersMap) {
	var data = dataStore.get(node) || dataStore.set(node, {}).get(node);
	data[key] = targetListenersMap;
}

function deleteRelatedData(node, key) {
	var data = dataStore.get(node);
	return delete data[key];
}

function batch(processBatchItems, shouldDeduplicate) {
	var waitingBatch = [];
	var waitingCalls = [];
	var dispatchSet = new Set();
	var isPrimed = false;
	return function batchAdd(items, callback) {
		if (shouldDeduplicate) {
			for (var i = 0; i < items.length; i++) {
				var item = items[i];
				var target = item.target;
				if (!dispatchSet.has(target)) {
					waitingBatch.push(item);
					dispatchSet.add(target);
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
				if (shouldDeduplicate) {
					dispatchSet = new Set();
				}
				isPrimed = false;
				processBatchItems(currentBatch);
				var callCount = currentCalls.length;
				for (var c = 0; c < callCount; c++) {
					currentCalls[c]();
				}
			});
		}
	};
}

function getDocumentListeners (target, key) {
	var doc = getDocument();
	var data = getRelatedData(doc, key);
	if (data) {
		return data.listeners;
	}
}

function getTargetListeners (target, key) {
	var doc = getDocument();
	var targetListenersMap = getRelatedData(doc, key);
	if (!targetListenersMap) {
		return;
	}

	return targetListenersMap.get(target);
}

function addTargetListener (target, key, listener) {
	var doc = getDocument();
	var targetListenersMap = getRelatedData(doc, key);
	if (!targetListenersMap) {
		targetListenersMap = new Map();
		setRelatedData(doc, key, targetListenersMap);
	}
	var targetListeners = targetListenersMap.get(target);
	if (!targetListeners) {
		targetListeners = [];
		targetListenersMap.set(target, targetListeners);
	}
	targetListeners.push(listener);
}

function removeTargetListener (target, key, listener) {
	var doc = getDocument();
	var targetListenersMap = getRelatedData(doc, key);
	if (!targetListenersMap) {
		return;
	}
	var targetListeners = targetListenersMap.get(target);
	if (!targetListeners) {
		return;
	}
	eliminate(targetListeners, listener);
	if (targetListeners.length === 0) {
		targetListenersMap['delete'](target);
		if (targetListenersMap.size === 0) {
			deleteRelatedData(doc, key);
		}
	}
}

function fire (callbacks, arg) {
	var safeCallbacks = slice.call(callbacks, 0);
	var safeCallbackCount = safeCallbacks.length;
	for (var i = 0; i < safeCallbackCount; i++) {
		safeCallbacks[i](arg);
	}
}

function dispatch(listenerKey, documentDataKey) {
	return function dispatchEvents(events) {
		for (var e = 0; e < events.length; e++) {
			var event = events[e];
			var target = event.target;

			var targetListeners = getTargetListeners(target, listenerKey);
			if (targetListeners) {
				fire(targetListeners, event);
			}

			if (!documentDataKey) {
				continue;
			}

			var documentListeners = getDocumentListeners(target, documentDataKey);
			if (documentListeners) {
				fire(documentListeners, event);
			}
		}
	};
}

function observeMutations(target, observerKey, config, handler) {
	var observerData = getRelatedData(target, observerKey);
	if (!observerData) {
		observerData = {
			observingCount: 0
		};
		setRelatedData(target, observerKey, observerData);
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
		var observerData = getRelatedData(target, observerKey);
		if (observerData) {
			observerData.observingCount--;
			if (observerData.observingCount <= 0) {
				if (observerData.observer) {
					observerData.observer.disconnect();
				}
				deleteRelatedData(target, observerKey);
				globals.offKeyValue('MutationObserver', setupObserver);
			}
		}
	};
}

function handleTreeMutations(mutations) {
	var mutationCount = mutations.length;
	for (var m = 0; m < mutationCount; m++) {
		var mutation = mutations[m];

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
	}
}

function handleAttributeMutations(mutations) {
	var mutationCount = mutations.length;
	for (var m = 0; m < mutationCount; m++) {
		var mutation = mutations[m];
		if (mutation.type === 'attributes') {
			var node = mutation.target;
			var attributeName = mutation.attributeName;
			var oldValue = mutation.oldValue;
			domMutate.dispatchNodeAttributeChange(node, attributeName, oldValue);
		}
	}
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
		// DocumentFragment
		if(target.nodeType === 11) {
			// This returns a noop without actually doing anything.
			// We should probably warn about passing a DocumentFragment here,
			// but since can-stache does so currently we are ignoring until that is
			// fixed.
			return Function.prototype;
		}

		var stopObserving;
		if (isAttributes) {
			stopObserving = observeMutations(target, observerKey, attributeMutationConfig, handleAttributeMutations);
		} else {
			stopObserving = observeMutations(getDocument(), observerKey, treeMutationConfig, handleTreeMutations);
		}

		addTargetListener(target, listenerKey, listener);
		return function removeNodeListener() {
			stopObserving();
			removeTargetListener(target, listenerKey, listener);
		};
	});
}

function addGlobalListener(globalDataKey, addNodeListener) {
	return subscription(function addGlobalGroupListener(documentElement, listener) {
		if (!isDocumentElement(documentElement)) {
			throw new Error('Global mutation listeners must pass a documentElement');
		}

		var doc = getDocument();
		var documentData = getRelatedData(doc, globalDataKey);
		if (!documentData) {
			documentData = {listeners: []};
			setRelatedData(doc, globalDataKey, documentData);
		}

		var listeners = documentData.listeners;
		if (listeners.length === 0) {
			// We need at least on listener for mutation events to propagate
			documentData.removeListener = addNodeListener(doc, function () {});
		}

		listeners.push(listener);

		return function removeGlobalGroupListener() {
			var documentData = getRelatedData(doc, globalDataKey);
			if (!documentData) {
				return;
			}

			var listeners = documentData.listeners;
			eliminate(listeners, listener);
			if (listeners.length === 0) {
				documentData.removeListener();
				deleteRelatedData(doc, globalDataKey);
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
	addNodeInsertionListener
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
 * @parent can-dom-utilities
 * @collection can-infrastructure
 *
 * @description Dispatch and listen for DOM mutations.
 * @group can-dom-mutate.static 0 methods
 * @group can-dom-mutate/modules 1 modules
 * @signature `domMutate`
 *
 * `can-dom-mutate` exports an object that lets you listen to changes
 * in the DOM using the [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
 * API.
 *
 * ```js
 * import domMutate from "can-dom-mutate";
 *
 * domMutate //->
 * {
 *   onAttributeChange( documentElement, callback ),
 *   onInsertion( documentElement, callback ),
 *   onRemoval( documentElement, callback ),
 *   onNodeAttributeChange( node, callback ),
 *   onNodeInsertion( node, callback ),
 *   onNodeRemoval( node, callback )
 * }
 *
 * // listen to every attribute change within the document:
 * domMutate.onAttributeChange(document.documentElement, function(mutationRecord){
 *   mutationRecord.target        //-> <input>
 *   mutationRecord.attributeName //-> "name"
 *   mutationRecord.oldValue      //-> "Ramiya"
 * })
 * ```
 *
 * If you want to support browsers that do not support the `MutationObserver` api, use
 * [can-dom-mutate/node] to update the DOM. Every module within CanJS should do this:
 *
 * ```js
 * var mutate = require('can-dom-mutate/node');
 * var el = document.createElement('div');
 *
 * mutate.appendChild.call(document.body, el);
 * ```
 */
domMutate = {
	/**
	* @function can-dom-mutate.dispatchNodeInsertion dispatchNodeInsertion
	* @hide
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
	* @hide
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
	* @parent can-dom-mutate.static
	* @hide
	*
	* Dispatch an attribute change mutation on the given node.
	*
	* @signature `dispatchNodeAttributeChange( node, attributeName, oldValue [, callback ] )`
	*
	* ```
	* input.setAttribute("value", "newValue")
	* domMutate.dispatchNodeAttributeChange(input, "value","oldValue")
	* ```
	*
	*
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

module.exports = namespace.domMutate = domMutate;
