'use strict';

var getRoot = require('can-util/js/global/global');
var currentMutationObserver;
var mutationObserverChangeListeners = [];

var domMutateObserver = {
	getGlobalDefault: function (root) {
		root = root || getRoot();
		return (
			root.MutationObserver ||
			root.WebKitMutationObserver ||
			root.MozMutationObserver
		);
	},
	get: function () {
		return currentMutationObserver;
	},
	set: function (observer) {
		currentMutationObserver = observer;
		mutationObserverChangeListeners.forEach(function (listener) {
			listener(currentMutationObserver);
		});
	},
	onChange: function (listener) {
		mutationObserverChangeListeners.push(listener);
		return function offChange() {
			mutationObserverChangeListeners = mutationObserverChangeListeners.filter(function (l) {
				return l !== listener;
			});
		};
	}
};

domMutateObserver.set(domMutateObserver.getGlobalDefault());
module.exports = domMutateObserver;
