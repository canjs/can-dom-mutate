var unit = require('steal-qunit');
var domMutate = require('../can-dom-mutate');
var node = require('../node');
var testUtils = require('./test-utils');

var test = unit.test;
var moduleMutationObserver = testUtils.moduleMutationObserver;

moduleMutationObserver('can-dom-mutate', function () {
	test('onNodeInsertion should be called when that node is inserted', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var child = document.createElement('div');

		var undo = domMutate.onNodeInsertion(child, function (node) {
			assert.equal(node, child, 'Node should be the inserted child');

			undo();
			done();
		});

		node.appendChild.call(parent, child);
	});

	test('onNodeRemoval should be called when that node is removed', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var child = document.createElement('div');

		var undo = domMutate.onNodeRemoval(child, function (node) {
			assert.equal(node, child, 'Node should be the removed child');

			undo();
			done();
		});

		parent.appendChild(child);
		node.removeChild.call(parent, child);
	});

	test('onNodeAttributeChange should be called when that node\'s attributes change', function (assert) {
		var done = assert.async();
		var child = document.createElement('div');
		var attributeName = 'foo';
		child.setAttribute(attributeName, 'bar');

		var undo = domMutate.onNodeAttributeChange(child, function (changeset) {
			assert.equal(changeset.node, child, 'Node should be the removed child');
			assert.equal(changeset.attributeName, attributeName);
			assert.equal(changeset.oldValue, 'bar');

			undo();
			done();
		});

		node.setAttribute.call(child, attributeName, 'baz');
	});

	test('onRemoval should be called when any node is removed', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var child = document.createElement('div');

		var undo = domMutate.onRemoval(function (node) {
			assert.equal(node, child, 'Node should be the removed child');

			undo();
			done();
		});

		parent.appendChild(child);
		node.removeChild.call(parent, child);
	});
});
