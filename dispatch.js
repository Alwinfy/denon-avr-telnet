"use strict";

const makeBoolean = (truthy, falsey) => ({
	into(bool) {
		return bool ? truthy : falsey;
	},
	from(string) {
		switch (string) {
		case truthy: return true;
		case falsey: return false;
		default: throw new Error(`Expected ${truthy} or ${falsey} from PW, got ${string}`);
		}
	}
});

const SI_TYPES = "PHONO CD TUNER DVD BD TV SAT/CBL DVR GAME GAME2 V.AUX DOCK HDRADIO IPOD NET/USB RHAPSODY NAPSTER PANDORA LASTFM FLICKR FAVORITES IRADIO SERVER USB/IPOD USB IPD FVP".split(" ");

module.exports = {
	"PW": makeBoolean("ON", "STANDBY"),
	"MU": makeBoolean("ON", "OFF"),
	"SI": {
		into(value) {
			if (~SI_TYPES.indexOf(value)) {
				return value;
			}
			throw new Error(`Tried to set unsupported input source: ${value}`);
		},
		from(string) {
			return string;
		}
	},
	"MV": {
		into(value) {
			// HACK: we take a boolean-or-string here. Find a dang either type?
			if (typeof value === "boolean") {
				return value ? "UP" : "DOWN";
			}
			const norm = 280 + value;
			if (norm > 199 && norm <= 279 && (norm * 2 | 0) == norm * 2) {
				return norm.toString().substring(1).replace(".", "");
			}
			throw new Error(`Expected to get boolean or integer or half-integer in range -80.5 to +1.0, got ${value}`);
		},
		from(string) {
			if (string.startsWith("MAX ") || string.startsWith("MIN ")) {
				string = string.substring(4);
			}
			const overflow = string.startsWith("99");
			const value = +(string.length == 2 ? string + "0" : string);
			if (isNaN(value)) {
				throw new Error(`Expected 2-3 digit number, got ${string}`);
			}
			// TODO: Add a better validator here
			return value / 10 - 80 - overflow * 100;
		}
	},
	
};
