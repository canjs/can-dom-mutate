'use strict';

var getRoot = require('can-util/js/global/global');
var canSymbol = require('can-symbol');
var observer;
var listeners = [];

function getGlobalDefault (root) {
	root = root || getRoot();
	return (
		root.MutationObserver ||
		root.WebKitMutationObserver ||
		root.MozMutationObserver
	);
}

function reflect (obj, methodName, method) {
	obj[methodName] = obj[canSymbol.for('can.' + methodName)] = method;
}

function ref (obj) {
	return function _ref (methodName, method) {
		reflect(obj, methodName, method);
		return _ref;
	};
}

var domMutateObserver = {};

ref(domMutateObserver)
	('getValue', function () {
		return observer;
	})
	('setValue', function (newObserver) {
		observer = newObserver;
		listeners.forEach(function (listener) {
			listener(observer);
		});
	})
	('onValue', function (listener) {
		listeners.push(listener);
	})
	('offValue', function (listener) {
		var index = listeners.indexOf(listener);
		if (index >= 0) {
			listeners.splice(index, 1);
		}
	});

domMutateObserver.setValue(getGlobalDefault());
module.exports = domMutateObserver;
