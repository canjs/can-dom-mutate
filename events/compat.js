'use strict';

var addEventCompat = require('can-dom-events/helpers/add-event-compat');

var attributesEvent = require('./attributes');
var insertedEvent = require('./inserted');
var removedEvent = require('./removed');

module.exports = {
	attributes: function (domEvents, eventType) {
		return addEventCompat(domEvents, attributesEvent, eventType);
	},
	inserted: function (domEvents, eventType) {
		return addEventCompat(domEvents, insertedEvent, eventType);
	},
	removed: function (domEvents, eventType) {
		return addEventCompat(domEvents, removedEvent, eventType);
	}
};
