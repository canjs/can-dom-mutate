var unit = require('steal-qunit');
var globals = require('can-globals');
var mutationObserverKey = 'MutationObserver';

function moduleWithMutationObserver (title, tests) {
	var hasMutationObserverSupport = !!globals.getKeyValue(mutationObserverKey);
	if (!hasMutationObserverSupport) {
		return;
	}

	unit.module(title + ' w/ MutationObserver', {}, tests);
}

function moduleWithoutMutationObserver (title, tests) {
	var hooks = {
		setup: function () {
			globals.setKeyValue(mutationObserverKey, null);
		},
		teardown: function () {
			globals.deleteKeyValue(mutationObserverKey);
		}
	};

	unit.module(title + ' w/o MutationObserver', hooks, tests);
}

function moduleMutationObserver (title, tests) {
	moduleWithMutationObserver(title, tests);
	moduleWithoutMutationObserver(title, tests);
}

function mock (obj, methodName, newMethod) {
	var oldMethod = obj[methodName];
	obj[methodName] = newMethod;
	return function unmock () {
		obj[methodName] = oldMethod;
	};
}

function getFixture () {
	return document.getElementById('qunit-fixture');
}

module.exports = {
	mock,
	getFixture,
	moduleMutationObserver: moduleMutationObserver,
	moduleWithMutationObserver: moduleWithMutationObserver,
	moduleWithoutMutationObserver: moduleWithoutMutationObserver
};
