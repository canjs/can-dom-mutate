var unit = require('steal-qunit');
var domMutate = require('../../node');
var domEvents = require('can-dom-events');
var testUtils = require('../test-utils');

var attributesEvent = require('../../events/attributes');
domEvents.addEvent(attributesEvent);

var test = unit.test;
var moduleMutationObserver = testUtils.moduleMutationObserver;

moduleMutationObserver('can-dom-mutate/events/attributes', function () {
	test('should fire attributes event when node is attributes', function (assert) {
		var done = assert.async();
		var child = document.createElement('div');
		child.setAttribute('foo', 'bar');

		domEvents.addEventListener(child, 'attributes', function onAttributes (event) {
			assert.equal(event.type, 'attributes', 'Should be the attributes event');
			assert.equal(event.target, child, 'Should target the attributes element');
			assert.equal(event.attributeName, 'foo', 'Should have the attribute name');
			assert.equal(event.oldValue, 'bar', 'Should have the old attribute value');

			done();
		});

		domMutate.setAttribute.call(child, 'foo', 'baz');
	});
});
