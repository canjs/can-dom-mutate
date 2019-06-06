'use strict';

var globals = require('can-globals');
var getRoot = require('can-globals/global/global');
var getMutationObserver = require('can-globals/mutation-observer/mutation-observer');
var namespace = require('can-namespace');
var DOCUMENT = require("can-globals/document/document");
var canReflect = require("can-reflect");
// var canSymbol = require("can-symbol");

var util = require('./-util');
var eliminate = util.eliminate;
var subscription = util.subscription;
var isDocumentElement = util.isDocumentElement;
var getAllNodes = util.getAllNodes;

// var slice = Array.prototype.slice;

// var onRemovedSymbol = canSymbol.for("can.onNodeRemoved");

var domMutate, dispatchInsertion, dispatchRemoval, dispatchAttributeChange;
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

	return function batchAdd(items, callback, dispatchConnected, flush) {
		processBatchItems(items, dispatchConnected, flush);
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

var promise = Promise.resolve();
function nextTick(handler) {
	promise.then(handler);
}

var recordsAndCallbacks = null;

function flushCallbacks(callbacks, arg){
	var callbacksCount = callbacks.length;
	var safeCallbacks = callbacks.slice(0);
	for(var c = 0; c < callbacksCount; c++){
		safeCallbacks[c](arg);
	}
}

function flushRecords(){
	if(recordsAndCallbacks === null) {
		return;
	}
	var safeBatch = recordsAndCallbacks;
	recordsAndCallbacks = null;

	var batchCount = safeBatch.length;

	for (var i = 0; i < batchCount; i++) {
		var batchData = safeBatch[i];
		flushCallbacks(batchData.callbacks, batchData.arg);
	}
}

function flushAsync(callbacks, arg) {
	if(recordsAndCallbacks === null) {
		recordsAndCallbacks = [{arg: arg, callbacks: callbacks}];
		nextTick(flushRecords);
	} else {
		recordsAndCallbacks.push({arg: arg, callbacks: callbacks});
	}
}

function dispatch(targetKey, connectedKey, documentDataKey) {
	return function dispatchEvents(events, dispatchConnected, flush) {
		// we could check the first element and see if it's in the document
		// if it is conditionally fire "connected" events
		for (var e = 0; e < events.length; e++) {
			var event = events[e];
			var target = event.target;
			// we need to check
			//
			var targetListeners = getTargetListeners(target, targetKey);

			if (targetListeners) {
				flush(targetListeners, event);
			}

			if(!dispatchConnected) {
				continue;
			}

			var connectedListeners;
			if(connectedKey){
				connectedListeners  = getTargetListeners(target, connectedKey);
			}

			if (connectedListeners) {
				flush(connectedListeners, event);
			}

			if (!documentDataKey) {
				continue;
			}

			var documentListeners = getDocumentListeners(target, documentDataKey);
			if (documentListeners) {
				flush(documentListeners, event);
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

	dispatchRemoval( toMutationEvents( canReflect.toArray(removed) ), null, true, flushCallbacks );
	dispatchInsertion( toMutationEvents( canReflect.toArray(added) ), null, true, flushCallbacks );
}

function handleAttributeMutations(mutations) {
	var mutationCount = mutations.length;
	for (var m = 0; m < mutationCount; m++) {
		var mutation = mutations[m];
		if (mutation.type === 'attributes') {
			var node = mutation.target;
			var attributeName = mutation.attributeName;
			var oldValue = mutation.oldValue;
			dispatchAttributeChange([{
				target: node,
				attributeName: attributeName,
				oldValue: oldValue
			}], null, true, flushCallbacks);
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
			if(stopObserving) {
				stopObserving();
			}

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
var connectedDataKey = domMutationPrefix + 'ConnectedData';
var disconnectedDataKey = domMutationPrefix + 'DisconnectedData';
var insertedDataKey = domMutationPrefix + 'InsertedData';
var removedDataKey = domMutationPrefix + 'RemovedData';
var attributeChangeDataKey = domMutationPrefix + 'AttributeChangeData';

// document listener keys
var documentConnectedDataKey = domMutationPrefix + 'DocumentConnectedData';
var documentDisconnectedDataKey = domMutationPrefix + 'DocumentDisconnectedData';
var documentAttributeChangeDataKey = domMutationPrefix + 'DocumentAttributeChangeData';

// observer keys
var treeDataKey = domMutationPrefix + 'TreeData';
var attributeDataKey = domMutationPrefix + 'AttributeData';

dispatchInsertion = batch(dispatch(insertedDataKey, connectedDataKey, documentConnectedDataKey));
dispatchRemoval = batch(dispatch(removedDataKey, disconnectedDataKey, documentDisconnectedDataKey));
dispatchAttributeChange = batch(dispatch(attributeChangeDataKey, null , documentAttributeChangeDataKey));

// node listeners
var addNodeConnectedListener = addNodeListener(connectedDataKey, treeDataKey);
var addNodeDisconnectedListener = addNodeListener(disconnectedDataKey, treeDataKey);
var addNodeInsertedListener = addNodeListener(insertedDataKey, treeDataKey);
var addNodeRemovedListener = addNodeListener(removedDataKey, treeDataKey);
var addNodeAttributeChangeListener = addNodeListener(attributeChangeDataKey, attributeDataKey, true);

// global listeners
var addConnectedListener = addGlobalListener(
	documentConnectedDataKey,
	addNodeConnectedListener
);
var addDisconnectedListener = addGlobalListener(
	documentDisconnectedDataKey,
	addNodeDisconnectedListener
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
	dispatchNodeInsertion: function (node, callback, dispatchConnected) {
		var nodes = new Set();
		util.addToSet( getAllNodes(node), nodes);
		var events = toMutationEvents( canReflect.toArray(nodes) );
		// this is basically an array of every single child of node including node
		dispatchInsertion(events, callback, dispatchConnected, flushAsync);
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
	dispatchNodeRemoval: function (node, callback, dispatchConnected) {
		var nodes = new Set();
		util.addToSet( getAllNodes(node), nodes);
		var events = toMutationEvents( canReflect.toArray(nodes) );
		dispatchRemoval(events, callback, dispatchConnected, flushAsync);
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
		}], callback, true, flushAsync);
	},

	/**
	* @function can-dom-mutate.onNodeConnected onNodeConnected
	*
	* Listen for insertion mutations on the given node.
	*
	* @signature `onNodeConnected( node, callback )`
	* @parent can-dom-mutate.static
	* @param {Node} node The node on which to listen for insertion mutations.
	* @param {function} callback The callback called when an insertion mutation is dispatched.
	* @return {function} The callback to remove the mutation listener.
	*/
	onNodeConnected: addNodeConnectedListener,
	onNodeInsertion: function(){
		// TODO: remove in prod
		console.warn("can-dom-mutate: Use onNodeConnected instead of onNodeInsertion");
		return addNodeConnectedListener.apply(this, arguments);
	},
	/**
	* @function can-dom-mutate.onNodeDisconnected onNodeDisconnected
	*
	* Listen for removal mutations on the given node.
	*
	* @signature `onNodeDisconnected( node, callback )`
	* @parent can-dom-mutate.static
	* @param {Node} node The node on which to listen for removal mutations.
	* @param {function} callback The callback called when a removal mutation is dispatched.
	* @return {function} The callback to remove the mutation listener.
	*/
	onNodeDisconnected: addNodeDisconnectedListener,
	onNodeRemoval: function(){
		// TODO: remove in prod
		console.warn("can-dom-mutate: Use onNodeDisconnected instead of onNodeRemoval");
		return addNodeDisconnectedListener.apply(this, arguments);
	},
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
	* @function can-dom-mutate.onDisconnected onDisconnected
	*
	* Listen for removal mutations on any node within the documentElement.
	*
	* @signature `onDisconnected( documentElement, callback )`
	* @parent can-dom-mutate.static
	* @param {Node} documentElement The documentElement on which to listen for removal mutations.
	* @param {function} callback The callback called when a removal mutation is dispatched.
	* @return {function} The callback to remove the mutation listener.
	*/
	onDisconnected: addDisconnectedListener,
	onRemoval: function(){
		// TODO: remove in prod
		console.warn("can-dom-mutate: Use onDisconnected instead of onRemoval");
		return addDisconnectedListener.apply(this, arguments);
	},
	/**
	* @function can-dom-mutate.onConnected onConnected
	*
	* Listen for insertion mutations on any node within the documentElement.
	*
	* @signature `onConnected( documentElement, callback )`
	* @parent can-dom-mutate.static
	* @param {Node} documentElement The documentElement on which to listen for removal mutations.
	* @param {function} callback The callback called when a insertion mutation is dispatched.
	* @return {function} The callback to remove the mutation listener.
	*/
	onConnected: addConnectedListener,
	onInsertion: function(){
		// TODO: remove in prod
		console.warn("can-dom-mutate: Use onConnected instead of onInsertion");
		return addConnectedListener.apply(this, arguments);
	},
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
	onAttributeChange: addAttributeChangeListener,

	flushRecords: function(doc){
		doc = doc || DOCUMENT();
		var data = dataStore.get(doc);
		if(data) {
			if(data.domMutationTreeData && data.domMutationTreeData.observer) {
				var records = data.domMutationTreeData.observer.takeRecords();
				handleTreeMutations(records);
			}
			// flush any synthetic records
			flushRecords();


		}
	},
	onNodeInserted: addNodeInsertedListener,
	onNodeRemoved: addNodeRemovedListener
};

//!steal-remove-start
if(process.env.NODE_ENV !== "production") {
	domMutate.dataStore = dataStore;
}
//!steal-remove-end

module.exports = namespace.domMutate = domMutate;
