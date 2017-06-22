'use strict';

var assign = require('can-util/js/assign/assign');
var observer = require('./observer');
var synthetic = require('./can-dom-mutate');

var compat = {
	appendChild: function (newChild) {
		synthetic.dispatchNodeInsertion(newChild);
		return this.appendChild(newChild);
	},
	insertBefore: function (newChild, refNode) {
		synthetic.dispatchNodeInsertion(newChild);
		return this.insertBefore(newChild, refNode);
	},
	removeChild: function (child) {
		synthetic.dispatchNodeRemoval(child);
		return this.removeChild(child);
	},
	replaceChild: function (newChild, oldChild) {
		synthetic.dispatchNodeRemoval(oldChild);
		var result = this.replaceChild(newChild, oldChild);
		synthetic.dispatchNodeInsertion(newChild);
		return result;
	},
	setAttribute: function (name, value) {
		var oldAttributeValue = this.getAttribute(name);
		var result = synthetic.dispatchNodeAttributeChange(this, name, value);
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

var mutate;

function setMutateStrategy(observer) {
	var strategy = observer ? normal : compat;
	assign(mutate, strategy);
}

mutate = {
	autoConfigure: function () {
		return observer.onChange(setMutateStrategy);
	}
};

setMutateStrategy(observer.get());
module.exports = mutate;
