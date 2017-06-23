'use strict';

var assign = require('can-util/js/assign/assign');
var observer = require('./-observer');
var synthetic = require('./can-dom-mutate');

var compat = {
	appendChild: function (newChild) {
		var result = this.appendChild(newChild);
		synthetic.dispatchNodeInsertion(newChild);
		return result;
	},
	insertBefore: function (newChild, refNode) {
		var result = this.insertBefore(newChild, refNode);
		synthetic.dispatchNodeInsertion(newChild);
		return result;
	},
	removeChild: function (child) {
		var result = this.removeChild(child);
		synthetic.dispatchNodeRemoval(child);
		return result;
	},
	replaceChild: function (newChild, oldChild) {
		var result = this.replaceChild(newChild, oldChild);
		synthetic.dispatchNodeRemoval(oldChild);
		synthetic.dispatchNodeInsertion(newChild);
		return result;
	},
	setAttribute: function (name, value) {
		var oldAttributeValue = this.getAttribute(name);
		var result = this.setAttribute(name, value);
		synthetic.dispatchNodeAttributeChange(this, name, oldAttributeValue);
		return result;
	}
};

var normal = {
	appendChild: function (newChild) {
		return this.appendChild(newChild);
	},
	insertBefore: function (newChild, refNode) {
		return this.insertBefore(newChild, refNode);
	},
	removeChild: function (child) {
		return this.removeChild(child);
	},
	replaceChild: function (newChild, oldChild) {
		return this.replaceChild(newChild, oldChild);
	},
	setAttribute: function (name, value) {
		return this.setAttribute(name, value);
	}
};

var mutate = {};

function setMutateStrategy(observer) {
	var strategy = observer ? normal : compat;
	assign(mutate, strategy);
}

setMutateStrategy(observer.getValue());
observer.onValue(setMutateStrategy);

module.exports = mutate;
