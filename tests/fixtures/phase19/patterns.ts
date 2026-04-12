export class UserFactory {
  createUser(name: string) {
    return { name };
  }
}

export class DatabaseSingleton {
  private static instance: DatabaseSingleton | null = null;

  static getInstance(): DatabaseSingleton {
    if (!DatabaseSingleton.instance) {
      DatabaseSingleton.instance = new DatabaseSingleton();
    }
    return DatabaseSingleton.instance;
  }
}

export class EventObserver {
  update(event: string) {
    console.log(event);
  }
}

export class RequestBuilder {
  private method = 'GET';
  setMethod(m: string) { this.method = m; return this; }
}

export class HttpAdapter {
  request(url: string) {
    return fetch(url);
  }
}
