'use strict';
var MutationObserver = require('mutation-observer');

var treeConfig = { childList: true, subtree: true };
var attributeConfig = { attributes: true, attributeOldValue: true };
var rootObserver; // singleton of RootObserver

function createMutationEvents(type) {
	return function(node) {
		var callbacks = rootObserver.subscriptions[type].get(node);
		if (callbacks) {
			callbacks.forEach(function(cb){
				cb({
					type: type,
					target: node
				});
			});
		}
	};
}

function observeMutations(node, config, callback){
	// create an observer instance
	var observer = new MutationObserver(function(mutations) {
		mutations.forEach(callback);
	});

	// pass in the target node, as well as the observer options
	observer.observe(node, config);

	return function() {
		observer.disconnect();
	};
}

function RootObserver() {
	this.subscriptions = {
		"inserted": new WeakMap(),
		"removed": new WeakMap()
	};
	this.unsubscribe = observeMutations(document.documentElement, treeConfig, function(mutationRecord) {
		mutationRecord.addedNodes.forEach( createMutationEvents('inserted') );
		mutationRecord.removedNodes.forEach( createMutationEvents('removed') );
	});
}

RootObserver.prototype.subscribe = function(node, type, callback) {
	var subscriptions = this.subscriptions;
	var callbacks = subscriptions[type].get(node);
	if (callbacks) {
		callbacks.push(callback);
	} else {
		callbacks = [callback];
		subscriptions[type].set(node, callbacks);
	}

	return function unsubscribeNode() {
		var callbacks = subscriptions[type].get(node);
		callbacks.splice(callbacks.indexOf(callback), 1);
		if (callbacks.length === 0) {
			subscriptions[type].delete(node);
		}
	};
};
var getRootObserver = function() {
	return rootObserver || (rootObserver = new RootObserver());
};

/**
 * @module {{}} can-dom-mutate
 * @parent can-infrastructure
 * @description Dispatch and listen for DOM mutations.
 * @group can-dom-events.static 0 static
 * @group can-dom-events.events 1 events
 * @signature `domMutation`
 */
var domMutate = {
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
	onNodeInsertion: function(node, callback) {
		return getRootObserver().subscribe(node, 'inserted', callback);
	},

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
	onNodeRemoval: function(node, callback){
		return getRootObserver().subscribe(node, 'removed', callback);
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
	onNodeAttributeChange: function (node, callback) {
		return observeMutations(node, attributeConfig, callback);
	},

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
	onRemoval: function(documentElement, callback){
		return observeMutations(documentElement, treeConfig, function(mutationRecord) {
			mutationRecord.removedNodes.forEach(function(node){
				callback({
					type: 'removed',
					target: node
				});
			});
		});
	},

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
	onInsertion: function(documentElement, callback){
		return observeMutations(documentElement, treeConfig, function(mutationRecord) {
			mutationRecord.addedNodes.forEach(function(node){
				callback({
					type: 'inserted',
					target: node
				});
			});
		});
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
	onAttributeChange: function(documentElement, callback){
		return observeMutations(documentElement, attributeConfig, callback);
	}
};

module.exports = domMutate;
