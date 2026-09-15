type User = { name: string; age: number };

export function greet(user: User): string {
  const parts: string[] = [];
  parts.push('hello');
  parts.push(user.name);
  const line = parts.join(', ');
  return `${line} (${user.age})`;
}
console.log(greet({ name: 'Ann', age: 30 }));
