'use strict';

var assign = require('can-util/js/assign/assign');
var observer = require('./-observer');
var domMutate = require('./can-dom-mutate');

function isInDocument (node) {
	return node.ownerDocument.documentElement.contains(node);
}

var synthetic = {
	dispatchNodeInsertion: function (node) {
		if (isInDocument(node)) {
			domMutate.dispatchNodeInsertion(node);
		}
	},
	dispatchNodeRemoval: function (node) {
		if (!isInDocument(node)) {
			domMutate.dispatchNodeRemoval(node);
		}
	}
};

var compat = {
	replaceChild: function (newChild, oldChild) {
		var result = this.replaceChild(newChild, oldChild);
		synthetic.dispatchNodeRemoval(oldChild);
		synthetic.dispatchNodeInsertion(newChild);
		return result;
	},
	setAttribute: function (name, value) {
		var oldAttributeValue = this.getAttribute(name);
		var result = this.setAttribute(name, value);
		domMutate.dispatchNodeAttributeChange(this, name, oldAttributeValue);
		return result;
	}
};

var compatData = [
	['appendChild', 'Insertion'],
	['insertBefore', 'Insertion'],
	['removeChild', 'Removal']
];
compatData.forEach(function (pair) {
	var nodeMethod = pair[0];
	var dispatchMethod = 'dispatchNode' + pair[1];
	compat[nodeMethod] = function (node) {
		var result = this[nodeMethod].apply(this, arguments);
		synthetic[dispatchMethod](node);
		return result;
	};
});

var normal = {};
var nodeMethods = ['appendChild', 'insertBefore', 'removeChild', 'replaceChild', 'setAttribute'];
nodeMethods.forEach(function (methodName) {
	normal[methodName] = function () {
		return this[methodName].apply(this, arguments);
	};
});

/**
* @module {{}} can-dom-mutate/node node
* @parent can-dom-mutate
*
* Append, insert, and remove DOM nodes. Also, change node attributes.
* This allows mutations to be dispatched in environments where MutationObserver is not supported.
*
* ```js
* var mutate = require('can-dom-mutate/node');
* var el = document.createElement('div');
*
* mutate.appendChild.call(document.body, el);
* ```
*/
var mutate = {};

/**
* @function can-dom-mutate/node.appendChild appendChild
*
* Append a node to an element, effectively `Node.prototype.appendChild`.
*
* @signature `mutate.appendChild.call(parent, child)`
* @parent can-dom-mutate.node
* @param {Node} parent The parent into which the child is inserted.
* @param {Node} child The child which will be inserted into the parent.
* @return {Node} The appended child.
*/

/**
* @function can-dom-mutate/node.insertBefore insertBefore
*
* Insert a node before a given reference node in an element, effectively `Node.prototype.insertBefore`.
*
* @signature `mutate.insertBefore.call(parent, child, reference)`
* @parent can-dom-mutate.node
* @param {Node} parent The parent into which the child is inserted.
* @param {Node} child The child which will be inserted into the parent.
* @param {Node} reference The reference which the child will be placed before.
* @return {Node} The inserted child.
*/

/**
* @function can-dom-mutate/node.removeChild removeChild
*
* Remove a node from an element, effectively `Node.prototype.removeChild`.
*
* @signature `mutate.removeChild.call(parent, child)`
* @parent can-dom-mutate.node
* @param {Node} parent The parent from which the child is removed.
* @param {Node} child The child which will be removed from the parent.
* @return {Node} The removed child.
*/

/**
* @function can-dom-mutate/node.replaceChild replaceChild
*
* Insert a node before a given reference node in an element, effectively `Node.prototype.replaceChild`.
*
* @signature `mutate.replaceChild.call(parent, newChild, oldChild)`
* @parent can-dom-mutate.node
* @param {Node} parent The parent into which the newChild is inserted.
* @param {Node} newChild The child which is inserted into the parent.
* @param {Node} oldChild The child which is removed from the parent.
* @return {Node} The replaced child.
*/

/**
* @function can-dom-mutate/node.setAttribute setAttribute
*
* Set an attribute value on an element, effectively `Element.prototype.setAttribute`.
*
* @signature `mutate.setAttribute.call(element, name, value)`
* @parent can-dom-mutate.node
* @param {Element} element The element on which to set the attribute.
* @param {String} name The name of the attribute to set.
* @param {String} value The value to set on the attribute.
*/

function setMutateStrategy(observer) {
	var strategy = observer ? normal : compat;
	assign(mutate, strategy);
}

setMutateStrategy(observer.getValue());
observer.onValue(setMutateStrategy);

module.exports = mutate;
