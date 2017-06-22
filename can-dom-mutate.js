'use strict';

var each = require('can-util/js/each/each');
var domData = require('can-util/dom/data/data');
var setImmediate = require('can-util/js/set-immediate/set-immediate');
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
		targetObserver.connect(target, config);
		observerData = {
			observer: targetObserver,
			observingCount: 0
		};
		domData.set.call(target, observerKey);
	}

	observerData.observingCount++;
	return function stopObservingMutations() {
		var observerData = domData.get.call(target, observerKey);
		if (observerData) {
			observerData.observingCount--;
			if (observerData.observingCount <= 0) {
				targetObserver.disconnect();
				domData.clean.call(target, observerKey);
			}
		}
	};
}

function handleTreeMutations(mutations) {
	mutations.forEach(function (mutation) {
		each(mutation.addNodes, function (node) {
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

function getDocument(target) {
	return target.ownerDocument || target.document || target;
}

var treeMutationConfig = {
	subtree: true,
	childList: true
};

var attributeMutationConfig = {
	attributes: true,
	oldAttributeValue: true
};

function addNodeListener(listenerKey, observerKey, isAttributes) {
	return function _addNodeListener(target, listener) {
		var stopObserving;
		if (isAttributes) {
			stopObserving = observeMutations(target, observerKey, attributeMutationConfig, handleAttributeMutations);
		} else {
			stopObserving = observeMutations(getDocument(target).documentElement, observerKey, treeMutationConfig, handleTreeMutations);
		}

		var removeTargetListener = addTargetListener(target, listenerKey, listener);
		return function removeNodeListener() {
			stopObserving();
			removeTargetListener();
		};
	};
}

function addGlobalListener(listenerGroup) {
	return function addGlobalGroupListener(listener) {
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
var addInsertionListener = addGlobalListener(insertionListeners);
var addRemovalListener = addGlobalListener(removalListeners);
var addAttributeChangeListener = addGlobalListener(attributeChangeListeners);

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

	onInsertion: addInsertionListener,
	onRemoval: addRemovalListener,
	onAttributeChange: addAttributeChangeListener
};

module.exports = domMutate;
