"use strict";
var getDocument = require("can-globals/document/document");

var push = Array.prototype.push;

function eliminate(array, item) {
	var index = array.indexOf(item);
	if (index >= 0) {
		array.splice(index, 1);
	}
}

function isInDocument (node) {
	var root = getDocument();
	if (root === node) {
		return true;
	}
	return root.contains(node);
}

function isDocumentElement (node) {
	return getDocument().documentElement === node;
}

function isFragment (node) {
	return !!(node && node.nodeType === 11);
}

function getChildren (parentNode) {
	var nodes = [];
	var node = parentNode.firstChild;
	while (node) {
		nodes.push(node);
		node = node.nextSibling;
	}
	return nodes;
}

function getParents (node) {
	var nodes;
	if (isFragment(node)) {
		nodes = getChildren(node);
	} else {
		nodes = [node];
	}
	return nodes;
}

function getAllNodes (node) {
	var nodes = getParents(node);
	var cLen = nodes.length;
	for (var c = 0; c < cLen; c++) {
		var element = nodes[c];
		if (element.getElementsByTagName) {
			var descendants = element.getElementsByTagName('*');
			push.apply(nodes, descendants);
		}
	}

	return nodes;
}

function subscription (fn) {
	return function _subscription () {
		var disposal = fn.apply(this, arguments);
		var isDisposed = false;
		return function _disposal () {
			if (isDisposed) {
				var fnName = fn.name || fn.displayName || 'an anonymous function';
				var message = 'Disposal function returned by ' + fnName + ' called more than once.';
				throw new Error(message);
			}
			disposal.apply(this, arguments);
			isDisposed = true;
		};
	};
}

module.exports = {
	eliminate: eliminate,
	isInDocument: isInDocument,
	getDocument: getDocument,
	isDocumentElement: isDocumentElement,
	isFragment: isFragment,
	getParents: getParents,
	getAllNodes: getAllNodes,
	getChildren: getChildren,
	subscription: subscription
};
