var unit = require('steal-qunit');
var domEvents = require('can-dom-events');
var domMutate = require('../can-dom-mutate');
var domMutateDomEvents = require('../dom-events');
var node = require('../node');
var testUtils = require('./test-utils');

var test = unit.test;

testUtils.moduleWithMutationObserver('can-dom-mutate/dom-events', function () {
	test('inserted', function (assert) {
		var done = assert.async();
		var fixture = testUtils.getFixture();
		var parent = document.createElement('div');
		var child = document.createElement('p');
		var parentInsertedHandler,
			childInsertedHandler,
			removeOnInsertionHandler;

		// add inserted event to registry
		domEvents.addEvent(domMutateDomEvents.inserted);

		var cleanup = function () {
			// clean up handlers added by addEventListener
			domEvents.removeEventListener(parent, 'inserted', parentInsertedHandler);
			domEvents.removeEventListener(child, 'inserted', childInsertedHandler);

			// clean up handler added by onInsertion
			removeOnInsertionHandler ();

			// remove inserted event from registry
			delete domEvents._eventRegistry._registry.inserted;

			// test complete
			done();
		};

		var insertedEventCount = 0;
		parentInsertedHandler = function () {
			insertedEventCount++;
		};
		domEvents.addEventListener(parent, 'inserted', parentInsertedHandler);

		// listen to inserted event on child to ensure event happens
		childInsertedHandler = function () {};
		domEvents.addEventListener(child, 'inserted', childInsertedHandler);

		// listen for any element being inserted and run appropriate test
		var onNodeInsertionCount = 0;
		removeOnInsertionHandler  = domMutate.onInsertion(document.documentElement, function () {
			switch(onNodeInsertionCount) {
				case 0:
					assert.equal(insertedEventCount, 1, 'inserted event should trigger for event.currentTarget');
					node.appendChild.call(parent, child);
					break;
				case 1:
					assert.equal(insertedEventCount, 1, 'inserted event should NOT trigger for child of event.currentTarget');
					setTimeout(cleanup, 50);
					break;
			}
			onNodeInsertionCount++;
		});

		node.appendChild.call(fixture, parent);
	});
});
