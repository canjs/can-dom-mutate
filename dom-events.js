'use strict';

var domMutate = require('can-dom-mutate');
var namespace = require('can-namespace');

function makeMutationEvent (defaultEventType, subscription, bubbles) {
	var elementSubscriptions = new Map();
	return {
		_subscriptions: elementSubscriptions,
		defaultEventType: defaultEventType,
		addEventListener: function (target, eventType, handler) {
			var dispatch = this.dispatch;
			var data = elementSubscriptions.get(target);
			if (!data) {
				data = {
					removeListener: null,
					listeners: new Set()
				};
				elementSubscriptions.set(target, data);
			}

			if (data.listeners.size === 0) {
				data.removeListener = subscription(target, function (mutation) {
					var eventData = {type: eventType};
					for (var key in mutation) {
						eventData[key] = mutation[key];
					}

					dispatch(target, eventData, bubbles !== false);
				});
			}

			data.listeners.add(handler);
			target.addEventListener(eventType, handler);
		},
		removeEventListener: function (target, eventType, handler) {
			target.removeEventListener(eventType, handler);
			var data = elementSubscriptions.get(target);
			if (data) {
				data.listeners['delete'](handler);
				if (data.listeners.size === 0) {
					data.removeListener();
					elementSubscriptions['delete'](target);
				}
			}		
		}
	};
}

module.exports = namespace.domMutateDomEvents = {
	attributes: makeMutationEvent('attributes', domMutate.onNodeAttributeChange),
	inserted: makeMutationEvent('inserted', domMutate.onNodeInsertion, false),
	removed: makeMutationEvent('removed', domMutate.onNodeRemoval)
};
