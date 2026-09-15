"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.greet = greet;
function greet(user) {
    const parts = [];
    parts.push('hello');
    parts.push(user.name);
    const line = parts.join(', ');
    return `${line} (${user.age})`;
}
console.log(greet({ name: 'Ann', age: 30 }));
//# sourceMappingURL=app.js.map