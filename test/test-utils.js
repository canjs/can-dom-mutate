var unit = require('steal-qunit');
var observer = require('../-observer');

function moduleWithMutationObserver (title, tests) {
	if (!observer.getValue()) {
		return
	}

	unit.module(title + ' w/ MutationObserver', {}, tests);
}

function moduleWithoutMutationObserver (title, tests) {
	var hooks = {
		setup: function () {
			this.oldMutationObserver = observer.getValue();
			observer.setValue(undefined);
		},
		teardown: function () {
			observer.setValue(this.oldMutationObserver);
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
