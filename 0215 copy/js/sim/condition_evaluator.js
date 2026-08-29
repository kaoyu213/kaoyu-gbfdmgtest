// ==========================================
//  GBF 模拟器 - 通用触发条件解析器
// ==========================================
(function (global) {
    'use strict';

    class ConditionPredicateRegistry {
        constructor() {
            this.handlers = new Map();
        }

        register(name, handler) {
            if (!name || typeof handler !== 'function') throw new Error('条件谓词需要名称和处理函数');
            this.handlers.set(String(name), handler);
            return this;
        }

        has(name) {
            return this.handlers.has(String(name));
        }

        evaluate(name, args, context) {
            const handler = this.handlers.get(String(name));
            if (!handler) return false;
            return !!handler(args || {}, context || {});
        }
    }

    function readPath(root, path) {
        if (path == null || path === '') return root;
        return String(path).split('.').reduce((value, key) => {
            if (value == null) return undefined;
            return value[key];
        }, root);
    }

    function resolveOperand(operand, context) {
        if (operand && typeof operand === 'object' && !Array.isArray(operand)) {
            if (operand.ref != null) return readPath(context, operand.ref);
            if (operand.path != null && Object.keys(operand).length === 1) return readPath(context, operand.path);
            if (Object.prototype.hasOwnProperty.call(operand, 'value')) return operand.value;
        }
        return operand;
    }

    const OPERATORS = {
        '==': (left, right) => left == right,
        '!=': (left, right) => left != right,
        '===': (left, right) => left === right,
        '!==': (left, right) => left !== right,
        '>': (left, right) => Number(left) > Number(right),
        '>=': (left, right) => Number(left) >= Number(right),
        '<': (left, right) => Number(left) < Number(right),
        '<=': (left, right) => Number(left) <= Number(right),
        in: (left, right) => Array.isArray(right) && right.includes(left),
        not_in: (left, right) => Array.isArray(right) && !right.includes(left),
        includes: (left, right) => Array.isArray(left)
            ? left.includes(right)
            : typeof left === 'string' && left.includes(String(right)),
        exists: (left) => left !== undefined && left !== null,
        not_exists: (left) => left === undefined || left === null,
        truthy: (left) => !!left,
        falsy: (left) => !left,
        between: (left, right) => Array.isArray(right)
            && Number(left) >= Number(right[0])
            && Number(left) <= Number(right[1]),
        matches: (left, right) => {
            try { return new RegExp(String(right)).test(String(left)); } catch (_) { return false; }
        }
    };

    class ConditionEvaluator {
        constructor(predicateRegistry) {
            this.predicates = predicateRegistry || new ConditionPredicateRegistry();
        }

        evaluate(node, context) {
            if (node == null) return true;
            if (typeof node === 'boolean') return node;
            if (Array.isArray(node)) return node.every((item) => this.evaluate(item, context));
            if (typeof node !== 'object') return !!node;

            if (Array.isArray(node.all)) return node.all.every((item) => this.evaluate(item, context));
            if (Array.isArray(node.any)) return node.any.some((item) => this.evaluate(item, context));
            if (node.not != null) return !this.evaluate(node.not, context);
            if (node.predicate) return this.predicates.evaluate(node.predicate, node.args, context);

            const leftOperand = node.left != null
                ? node.left
                : node.field != null
                    ? { ref: String(node.field).includes('.') ? node.field : `event.${node.field}` }
                    : node.path != null
                        ? { ref: node.path }
                        : undefined;
            const rightOperand = Object.prototype.hasOwnProperty.call(node, 'right') ? node.right : node.value;
            const left = resolveOperand(leftOperand, context || {});
            const right = resolveOperand(rightOperand, context || {});
            const operator = String(node.operator || node.op || '==');
            const handler = OPERATORS[operator];
            return handler ? !!handler(left, right, node, context || {}) : false;
        }

        resolve(operand, context) {
            return resolveOperand(operand, context || {});
        }
    }

    const predicates = new ConditionPredicateRegistry();
    const evaluator = new ConditionEvaluator(predicates);
    const api = { ConditionPredicateRegistry, ConditionEvaluator, predicates, evaluator, readPath };
    global.BattleConditions = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
