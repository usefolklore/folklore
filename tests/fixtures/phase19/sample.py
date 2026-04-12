"""sample.py — Phase 19 Python parser test fixture"""

import os

def greet(name):
    return f"hello {name}"

class Greeter:
    def __init__(self, name):
        self.name = name

    def say(self):
        return greet(self.name)
