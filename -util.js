"use strict";
var getDocument = require("can-globals/document/document");

function eliminate(array, item) {
	var index = array.indexOf(item);
	if (index >= 0) {
		array.splice(index, 1);
	}
}

function addToSet(items, set) {
	for(var i =0, length = items.length; i < length; i++ ) {
		set.add(items[i]);
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


function getNodesLegacyB(node) {
	var skip, tmp;

	var depth = 0;

	var items = isFragment(node) ? [] : [node];
	if(node.firstChild == null) {
		return items;
	}

	// Always start with the initial element.
	do {
		if ( !skip && (tmp = node.firstChild) ) {
			depth++;
			items.push(tmp);
		} else if ( tmp = node.nextSibling ) {
			skip = false;
			items.push(tmp);
		} else {
			// Skipped or no first child and no next sibling, so traverse upwards,
			tmp = node.parentNode;
			// and decrement the depth.
			depth--;
			// Enable skipping, so that in the next loop iteration, the children of
			// the now-current node (parent node) aren't processed again.
			skip = true;
		}

		// Instead of setting node explicitly in each conditional block, use the
		// tmp var and set it here.
		node = tmp;

		// Stop if depth comes back to 0 (or goes below zero, in conditions where
		// the passed node has neither children nore next siblings).
	} while ( depth > 0 );

	return items;
}

function getNodesWithTreeWalker(rootNode) {
	var result = isFragment(rootNode) ? [] : [rootNode];

	var walker = getDocument().createTreeWalker(
		rootNode,
		NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
		null,
		false
	);

	var node;
	while(node = walker.nextNode()) {
		result.push(node);
	}
	return result;
}

function getAllNodes (node) {
	if( getDocument().createTreeWalker !== undefined ) {
		return getNodesWithTreeWalker(node);
	} else {
		return getNodesLegacyB(node);
	}
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
	subscription: subscription,
	addToSet: addToSet
};
