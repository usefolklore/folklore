/** sample.ts — Phase 19 parser test fixture */

export interface Person {
  id: string;
  name: string;
}

export type Greeting = 'hello' | 'hi';

export class Greeter {
  constructor(private readonly g: Greeting) {}

  greet(p: Person): string {
    return `${this.g}, ${p.name}`;
  }
}

export function makeGreeter(g: Greeting): Greeter {
  return new Greeter(g);
}

export const loudGreet = (p: Person): string => {
  const greeter = makeGreeter('hello');
  return greeter.greet(p).toUpperCase();
};
