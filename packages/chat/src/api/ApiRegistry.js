/** @import { ReactiveController, ReactiveControllerHost } from "lit" */

/**
 * @typedef {Record<string, Record<string, (...args: any[]) => any>>} ApiShape
 * @typedef {{
 *   host: ReactiveControllerHost,
 *   impl: Record<string, (...args: any[]) => any>,
 *   snapshot: (() => unknown[]) | undefined,
 *   previous: unknown[] | undefined,
 *   controller: ReactiveController,
 * }} Owner
 */

/**
 * Namespaced imperative API: one owner per namespace, stable facades that resolve the current owner
 * on every call and fall back to no-op defaults. Fires `change` (`detail.namespace`) when an owner
 * comes or goes, or when its snapshot differs after the owner's update.
 * @template {ApiShape} Api
 */
export class ApiRegistry extends EventTarget {
  /** @type {Api} */
  #defaults;
  /** @type {string} */
  #name;
  /** @type {Map<string, Owner>} */
  #owners = new Map();
  /** @type {Set<string>} */
  #warned = new Set();

  /** @type {Api} */
  facades;

  /**
   * @param {Api} defaults - frozen; its keys are the namespaces and method names
   * @param {{name: string}} options - prefix for console diagnostics
   */
  constructor(defaults, { name }) {
    super();
    this.#defaults = defaults;
    this.#name = name;
    const facades = /** @type {Record<string, unknown>} */ ({});
    for (const ns of Object.keys(defaults)) facades[ns] = this.#createFacade(ns);
    this.facades = /** @type {Api} */ (Object.freeze(facades));
  }

  /**
   * @template {keyof Api & string} N
   * @param {N} ns
   * @param {ReactiveControllerHost} host
   * @param {Api[N]} impl
   * @param {() => unknown[]} [snapshot]
   * @returns {() => void} unregister
   */
  register(ns, host, impl, snapshot) {
    const existing = this.#owners.get(ns);
    if (existing && existing.host !== host) {
      console.error(`[${this.#name}] "${ns}" already has an owner — the new one replaces it`, host);
    }
    if (existing) this.#drop(ns, existing);

    /** @type {Owner} */
    const owner = {
      host,
      impl,
      snapshot,
      previous: snapshot?.(),
      controller: { hostUpdated: () => this.check(ns) },
    };
    this.#owners.set(ns, owner);
    host.addController(owner.controller);
    this.#warned.delete(ns);
    this.#emit(ns);

    return () => {
      if (this.#owners.get(ns) !== owner) return; // a newer owner took over
      this.#drop(ns, owner);
      this.#emit(ns);
    };
  }

  /** @param {keyof Api & string} ns */
  isAvailable(ns) {
    return this.#owners.has(ns);
  }

  /**
   * The current owner's impl, or the defaults — without the no-owner warning. For reads that are
   * expected to run before an owner mounts.
   * @template {keyof Api & string} N
   * @param {N} ns
   * @returns {Api[N]}
   */
  current(ns) {
    return /** @type {Api[N]} */ (this.#owners.get(ns)?.impl ?? this.#defaults[ns]);
  }

  /**
   * Compares the namespace's snapshot now — for owners whose state changes without a host update.
   * @param {keyof Api & string} ns
   */
  check(ns) {
    const owner = this.#owners.get(ns);
    if (!owner?.snapshot) return;
    const next = owner.snapshot();
    const previous = owner.previous;
    owner.previous = next;
    if (
      !previous ||
      next.length !== previous.length ||
      next.some((v, i) => !Object.is(v, previous[i]))
    ) {
      this.#emit(ns);
    }
  }

  /** @param {string} ns */
  #createFacade(ns) {
    const facade = /** @type {Record<string, (...args: any[]) => any>} */ ({});
    for (const method of Object.keys(this.#defaults[ns])) {
      facade[method] = (...args) => this.#resolve(ns)[method](...args);
    }
    return Object.freeze(facade);
  }

  /** @param {string} ns */
  #resolve(ns) {
    const owner = this.#owners.get(ns);
    if (owner) return owner.impl;
    if (!this.#warned.has(ns)) {
      this.#warned.add(ns);
      console.warn(`[${this.#name}] ${ns}.*() called with no owner registered — ignored`);
    }
    return this.#defaults[ns];
  }

  /** @param {string} ns @param {Owner} owner */
  #drop(ns, owner) {
    owner.host.removeController(owner.controller);
    this.#owners.delete(ns);
  }

  /** @param {string} ns */
  #emit(ns) {
    this.dispatchEvent(new CustomEvent("change", { detail: { namespace: ns } }));
  }
}

/**
 * Freezes the top level and every namespace object.
 * @template {ApiShape} Api
 * @param {Api} api
 * @returns {Api}
 */
export function freezeApi(api) {
  for (const ns of Object.values(api)) Object.freeze(ns);
  return Object.freeze(api);
}
