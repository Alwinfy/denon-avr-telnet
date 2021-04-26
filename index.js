"use strict";

const {EventEmitter} = require("events");
const Telnet = require("telnet-client");

// TODO: Move this into its own module
const dispatchTable = {
	"PW": {
		into(bool) {
			return bool ? "ON" : "STANDBY";
		},
		from(string) {
			switch (string) {
			case "ON": return true;
			case "STANDBY": return false;
			default: throw new Error(`Expected ON or STANDBY from PW, got ${string}`);
			}
		}
	}
};

class DenonAvrTelnet extends EventEmitter {
	/**
	 * @param {string} host the host to be connected to
	 * @param {number?} port the port to connect to; defaults to 23
	 * @param {number?} timeout the timeout on requests; set to 0 to disable
	 */
	constructor(host, port, timeout) {
		super();
		this.client = new Telnet();
		this.partial = "";
		this.timeout = timeout || null;
		this.client
			.connect({
				host,
				port: port || 23,
				// timeout: timeout === undefined ? 5000 : timeout,
				irs: "\r",
				ors: "\r"
			})
			.then(() => this.emit("connected"));
		this.queues = {};
		this.dispatchTable = dispatchTable;
		this.client.on("data", buffer => this.onData(buffer));
	}

	async query(type, query) {
		const queue = this.queues[type] = this.queues[type] || [];
		await this.rawQuery(type, query);
		return new Promise((resolve, reject) => {
			// TODO: Find a somewhat less hacky way to do this?
			const entry = {pending: true, resolve, reject};
			queue.push(entry);
			if (this.timeout) {
				setTimeout(() => {
					reject("Process timed out");
					entry.pending = false;
				}, this.timeout);
			}
		});
	}
	rawQuery(type, query) {
		return this.client.send(type + query);
	}

	onData(buffer) {
		const data = (this.partial + buffer.toString()).split("\r");
		this.emit("data", data);
		this.partial = data.pop();
		data.forEach(line => this.parseResponse(line));
	}
	parseResponse(line) {
		if (!line) {
			return;
		}
		if (line.length < 2) {
			this.emit("error", "Got bad response from server: " + line);
		}
		const prefix = line.substring(0, 2).toUpperCase();
		const body = line.substring(2);
		this.emit("raw-" + prefix, body);

		// TODO: Clean this part of the error handling up somehow
		let pretty = null, error = null;
		try {
			pretty = this.prettify(prefix, body);
			this.emit(prefix, pretty);
		} catch (e) {
			error = e;
			this.emit("error", error);
		}
		const queue = this.queues[prefix];
		if (!(queue && this.dispatchQueued(queue, pretty, error)) && !error) {
			this.emit("async-" + prefix, pretty);
		}
	}

	prettify(prefix, body) {
		const transformer = this.dispatchTable[prefix];
		return transformer ? transformer.from(body) : body;
	}

	/** @returns {boolean} whether the dispatch succeeded */
	dispatchQueued(queue, pretty, error) {
		while (queue.length) {
			const entry = queue.shift();
			if (entry.pending) {
				if (error) {
					entry.reject(error);
				} else {
					entry.resolve(pretty);
				}
				return true;
			}
		}
		return false;
	}

	close() {
		return this.client.end();
	}

	set(prefix, value) {
		const transformer = this.dispatchTable[prefix];
		if (!transformer) {
			throw new Error(`Setting value not supported yet for type: ${prefix}`);
		}
		return this.setRaw(prefix, transformer.into(value));
	}
	setRaw(prefix, value) {
		return this.rawQuery(prefix, value);
	}

	get(prefix) {
		return this.query(prefix, "?");
	}

	// TODO: Add more sugary hooks for indiv. things
}
module.exports = DenonAvrTelnet;
