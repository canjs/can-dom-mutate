'use strict';

var domData = require('can-dom-data-state');
var CIDMap = require('can-cid/map/map');
var CIDSet = require('can-cid/set/set');

function getDataKey(eventType, defaultEventType) {
	return eventType + defaultEventType + 'Data';
}

function makeMutationEvent(defaultEventType, subscription, dispatch, dispatchOnce) {
	var event = {
		defaultEventType: defaultEventType,
		addEventListener: function (target, eventType, handler) {
			var dataKey = getDataKey(eventType, defaultEventType);
			var doc = target.ownerDocument;
			var documentData = domData.get.call(doc, dataKey);
			if (!documentData) {
				documentData = new CIDMap();
				domData.set.call(doc, dataKey, documentData);
			}

			var data = documentData.get(target);
			if (!data) {
				data = {
					removeListener: null,
					listeners: new CIDSet()
				};
				documentData.set(target, data);
			}

			var hasSubscription = data.listeners.has(handler);
			if (hasSubscription) {
				return;
			}

			if (data.listeners.size === 0) {
				var domEvents = this;
				var removeListener = subscription(target, function (mutation) {
					dispatch(domEvents.dispatch, target, eventType, mutation);
					if (dispatchOnce) {
						// NOTE: The event will only ever be fired once
						// This is for backwards-compatibility with can-util/dom/events
						data.listeners.forEach(function (handler) {
							event.removeEventListener(target, eventType, handler);
						});
					}
				});
				data.removeListener = removeListener;
			}

			data.listeners.add(handler);

			target.addEventListener(eventType, handler);
		},
		removeEventListener: function (target, eventType, handler) {
			var dataKey = getDataKey(eventType, defaultEventType);
			var doc = target.ownerDocument;
			var documentData = domData.get.call(doc, dataKey);
			if (!documentData) {
				return;
			}

			var data = documentData.get(target);
			if (!data) {
				return;
			}

			data.listeners['delete'](handler);

			if (data.listeners.size === 0) {
				data.removeListener();

				if (data.size === 0) {
					documentData['delete'](target);

					if (documentData.size === 0) {
						domData.clean.call(doc, dataKey);
					}
				}
			}

			target.removeEventListener(eventType, handler);
		}
	};

	return event;
}
module.exports = makeMutationEvent;
