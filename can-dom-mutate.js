'use strict';

var globals = require('can-globals');
var getRoot = require('can-globals/global/global');
var getMutationObserver = require('can-globals/mutation-observer/mutation-observer');
var namespace = require('can-namespace');
var DOCUMENT = require("can-globals/document/document");
var canReflect = require("can-reflect");

var util = require('./-util');
var eliminate = util.eliminate;
var subscription = util.subscription;
var isDocumentElement = util.isDocumentElement;
var getAllNodes = util.getAllNodes;

var slice = Array.prototype.slice;

var domMutate, dispatchInsertion, dispatchRemoval;
var dataStore = new WeakMap();

function getRelatedData(node, key) {
	var data = dataStore.get(node);
	if (data) {
		return data[key];
	}
}

function setRelatedData(node, key, targetListenersMap) {
	var data = dataStore.get(node);
	if (!data) {
		data = {};
		dataStore.set(node, data);
	}
	data[key] = targetListenersMap;
}

function deleteRelatedData(node, key) {
	var data = dataStore.get(node);
	return delete data[key];
}

function toMutationEvents (nodes) {
	var events = [];
	for (var i = 0; i < nodes.length; i++) {
		events.push({target: nodes[i]});
	}
	return events;
}

function batch(processBatchItems) {

	return function batchAdd(items, callback) {
		processBatchItems(items);
		if(callback){
			callback();
		}
	};
}

function getDocumentListeners (target, key) {
	var doc = DOCUMENT();
	var data = getRelatedData(doc, key);
	if (data) {
		return data.listeners;
	}
}

function getTargetListeners (target, key) {
	var doc = DOCUMENT();
	var targetListenersMap = getRelatedData(doc, key);
	if (!targetListenersMap) {
		return;
	}

	return targetListenersMap.get(target);
}

function addTargetListener (target, key, listener) {
	var doc = DOCUMENT();
	var targetListenersMap = getRelatedData(doc, key);
	if (!targetListenersMap) {
		targetListenersMap = new WeakMap();
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
	var doc = DOCUMENT();
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
var count = 0;

function observeMutations(target, observerKey, config, handler) {

	var observerData = getRelatedData(target, observerKey);
	if (!observerData) {
		observerData = {
			observingCount: 0
		};
		setRelatedData(target, observerKey, observerData);
	}

	var setupObserver = function () {
		// disconnect the old one
		if (observerData.observer) {
			observerData.observer.disconnect();
			observerData.observer = null;
		}

		var MutationObserver = getMutationObserver();
		if (MutationObserver) {
			var Node = getRoot().Node;
			var isRealNode = !!(Node && target instanceof Node);
			if (isRealNode) {
				var targetObserver = new MutationObserver(handler);
				targetObserver.id = count++;
				targetObserver.observe(target, config);
				observerData.observer = targetObserver;
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
	// in IE11, if the document is being removed
	// (such as when an iframe is added and then removed)
	// all of the global constructors will not exist
	// If this happens before a tree mutation is handled,
	// this will throw an `Object expected` error.
	if (typeof Set === "undefined") { return; }

	var mutationCount = mutations.length;
	var added = new Set(), removed = new Set();
	for (var m = 0; m < mutationCount; m++) {
		var mutation = mutations[m];


		var addedCount = mutation.addedNodes.length;
		for (var a = 0; a < addedCount; a++) {
			util.addToSet( getAllNodes(mutation.addedNodes[a]), added);
		}

		var removedCount = mutation.removedNodes.length;
		for (var r = 0; r < removedCount; r++) {
			util.addToSet( getAllNodes(mutation.removedNodes[r]), removed);
		}
	}

	dispatchRemoval( toMutationEvents( canReflect.toArray(removed) ) );
	dispatchInsertion( toMutationEvents( canReflect.toArray(added) ) );
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
			stopObserving = observeMutations(DOCUMENT(), observerKey, treeMutationConfig, handleTreeMutations);
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

		var doc = DOCUMENT();
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

dispatchInsertion = batch(dispatch(insertionDataKey, documentInsertionDataKey));
dispatchRemoval = batch(dispatch(removalDataKey, documentRemovalDataKey));
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
		var nodes = new Set();
		util.addToSet( getAllNodes(node), nodes);
		var events = toMutationEvents( canReflect.toArray(nodes) );
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
		var nodes = new Set();
		util.addToSet( getAllNodes(node), nodes);
		var events = toMutationEvents( canReflect.toArray(nodes) );
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
