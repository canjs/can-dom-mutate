'use strict';

var assign = require('can-util/js/assign/assign');
var observer = require('./-observer');
var synthetic = require('./can-dom-mutate');

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
		synthetic.dispatchNodeAttributeChange(this, name, oldAttributeValue);
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

var mutate = {};

function setMutateStrategy(observer) {
	var strategy = observer ? normal : compat;
	assign(mutate, strategy);
}

setMutateStrategy(observer.getValue());
observer.onValue(setMutateStrategy);

module.exports = mutate;
