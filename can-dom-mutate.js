'use strict';

var each = require('can-util/js/each/each');
var domData = require('can-util/dom/data/data');
var CIDMap = require('can-util/js/cid-map/cid-map');
var setImmediate = require('can-util/js/set-immediate/set-immediate');
var getGlobalDocument = require('can-util/dom/document/document');
var observer = require('./observer');

var domMutate;

function eliminate(array, item) {
	var index = array.indexOf(item);
	if (index >= 0) {
		array.splice(index, 1);
	}
}

function batch(processBatchItems) {
	var waitingBatch = [];
	var waitingCalls = [];
	var isPrimed = false;
	return function batchAdd(items, callback) {
		waitingBatch = waitingBatch.concat(items);
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
				isPrimed = false;
				processBatchItems(currentBatch);
				currentCalls.forEach(function (callback) {
					callback();
				});
			});
		}
	};
}

/*
Currently, can-util prevents the following solution.

For memory safety when a node is removed from the
dom so is all of its domData. In order to track
removed nodes, we must store our listeners on the
document which maps the listeners to the target.

function getTargetListeners(target, key) {
return domData.get.call(target, key);
}

function addTargetListener(target, key, listener) {
	var listeners = domData.get.call(target, key);
	if (listeners) {
		listeners.push(listener);
	} else {
		domData.set.call(target, key, [listener]);
	}

	return function removeTargetListener() {
		var listeners = domData.get.call(target, key);
		if (listeners) {
			eliminate(listeners, listener);
			if (listeners.length === 0) {
				domData.clean.call(target, key);
			}
		}
	};
}
*/

function getDocument(target) {
	return target.ownerDocument || target.document || target;
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

function dispatch(listenerKey, globalListeners, isAttributes) {
	return function dispatchEvents(events) {
		for (var e = 0; e < events.length; e++) {
			var event = events[e];
			var target = isAttributes ? event.node : event;
			var targetListeners = getTargetListeners(target, listenerKey);
			if (targetListeners) {
				// dispatch for target listeners
				for (var t = 0; t < targetListeners.length; t++) {
					targetListeners[t](event);
				}
			}
			// dispatch for global listeners
			for (var l = 0; l < globalListeners.length; l++) {
				globalListeners[l](event);
			}
		}
	};
}

function observeMutations(target, observerKey, config, handler) {
	var MutationObserver = observer.get();
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

function handleTreeMutations(mutations) {
	mutations.forEach(function (mutation) {
		each(mutation.addedNodes, function (node) {
			domMutate.dispatchNodeInsertion(node);
		});
		each(mutation.removedNodes, function (node) {
			domMutate.dispatchNodeRemoval(node);
		});
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
	return function _addNodeListener(target, listener) {
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
	};
}

function addGlobalListener(listenerData, addNodeListener) {
	return function addGlobalGroupListener(listener) {
		var listenerGroup = listenerData.listeners;
		if (listenerGroup.length === 0) {
			// We need to have at least one nodeListener
			// for global mutation events to propagate.
			// NOTE: This will behave unexpectedly when the
			// document switches, unless something in the
			// new document is observed or all global
			// listeners are cleaned up on the first document first.
			var doc = getGlobalDocument().documentElement;
			listenerData.removeListener = addNodeListener(doc, function () {});
		}

		listenerGroup.push(listener);
		var isRemoved = false;

		return function removeGlobalGroupListener() {
			if (isRemoved) {
				var message = [
					'Remove function called more than once',
					'Global mutation listeners can only be removed once'
				].join('. ');
				throw new Error(message);
			}

			eliminate(listenerGroup, listener);
			if (listenerGroup.length === 0) {
				listenerData.removeListener();
				listenerData.removeListener = undefined;
			}

			isRemoved = true;
		};
	};
}

function toNodes(child) {
	var isFragment = child.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
	if (!isFragment) {
		return [child];
	}

	var children = [];
	var node = child.firstChild;
	while (node) {
		var nodes = toNodes(child);
		for (var i = 0; i < nodes.length; i++) {
			children.push(nodes[i]);
		}
		node = node.nextSibling;
	}

	return children;
}

var domMutationPrefix = 'domMutation';

// listener keys
var insertionDataKey = domMutationPrefix + 'InsertionData';
var removalDataKey = domMutationPrefix + 'RemovalData';
var attributeChangeDataKey = domMutationPrefix + 'AttributeChangeData';

// observer keys
var treeDataKey = domMutationPrefix + 'TreeData';
var attributeDataKey = domMutationPrefix + 'AttributeData';

// listener buckets
var insertionListeners = [];
var removalListeners = [];
var attributeChangeListeners = [];

var dispatchInsertion = batch(dispatch(insertionDataKey, insertionListeners));
var dispatchRemoval = batch(dispatch(removalDataKey, removalListeners));
var dispatchAttributeChange = batch(dispatch(attributeChangeDataKey, attributeChangeListeners, true));

// node listeners
var addNodeInsertionListener = addNodeListener(insertionDataKey, treeDataKey);
var addNodeRemovalListener = addNodeListener(removalDataKey, treeDataKey);
var addNodeAttributeChangeListener = addNodeListener(attributeChangeDataKey, attributeDataKey, true);

// global listeners
// var addInsertionListener = addGlobalListener(insertionListeners);
var globalRemovalListenerData = {listeners: removalListeners};
var addRemovalListener = addGlobalListener(
	globalRemovalListenerData,
	addNodeRemovalListener
);
// var addAttributeChangeListener = addGlobalListener(attributeChangeListeners);

domMutate = {
	dispatchNodeInsertion: function (node, callback) {
		dispatchInsertion(toNodes(node), callback);
	},
	dispatchNodeRemoval: function (node, callback) {
		dispatchRemoval(toNodes(node), callback);
	},
	dispatchNodeAttributeChange: function (node, attributeName, oldValue, callback) {
		dispatchAttributeChange({
			node: node,
			attributeName: attributeName,
			oldValue: oldValue
		}, callback);
	},

	onNodeInsertion: addNodeInsertionListener,
	onNodeRemoval: addNodeRemovalListener,
	onNodeAttributeChange: addNodeAttributeChangeListener,

	// onInsertion: addInsertionListener,
	onRemoval: addRemovalListener,
	// onAttributeChange: addAttributeChangeListener
};

module.exports = domMutate;
