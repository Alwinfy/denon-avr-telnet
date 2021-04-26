"use strict";

const {EventEmitter} = require("events");
const Telnet = require("telnet-client");

const {SI_TYPES, dispatchTable} = require("./dispatch");

const aliases = {
	"MU": "Mute",
	"PW": "Power",
	"SI": "Input",
	"MV": "Volume",
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
				timeout: 1000,
				sendTimeout: 1200,
				negotiationMandatory: false,
				// timeout: timeout === undefined ? 5000 : timeout,
				irs: "\r",
				ors: "\r"
			})
			.then(() => this.emit("connected"));
		this.queues = {};
		this.dispatchTable = dispatchTable;
		this.client.on("data", buffer => this.onData(buffer));
		this.setupSugar();
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
		this.emit("raw", line);
		if (line.length < 2) {
			return;
		}
		const prefix = line.substring(0, 2).toUpperCase();
		// ignore unknown opcodes
		const transformer = this.dispatchTable[prefix];
		if (!transformer) {
			return;
		}
		const body = line.substring(2);
		this.emit("raw:" + prefix, body);

		// TODO: Clean this part of the error handling up somehow
		let pretty = null, error = null;
		try {
			pretty = transformer.from(body);
			if (pretty !== null) {
				this.emit(prefix, pretty);
			}
		} catch (e) {
			error = e;
			this.emit("error", error);
		}
		const queue = this.queues[prefix];
		if (!(queue && this.dispatchQueued(queue, pretty, error)) && !error) {
			this.emit("async", prefix, pretty);
			this.emit("async:" + prefix, pretty);
		}
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

	setupSugar() {
		for (const key in aliases) {
			const suffix = aliases[key];
			const eventName = suffix.toLowerCase() + "Changed";
			this["set" + suffix] = val => this.set(key, val);
			this["get" + suffix] = () => this.get(key);
			this.on(key, val => this.emit(eventName, val));
		}
		this.setVolumeRelative = (val) => this.set("MV", !!val);
	}
	// TODO: Add more sugary hooks for indiv. things (or automate hook addition?)
}

module.exports = {DenonAvrTelnet, SI_TYPES};
