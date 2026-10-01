import { html } from "lit";

import "../index.js";
import {
  allPreset,
  cppPreset,
  dotnetPreset,
  goPreset,
  jvmPreset,
  pythonPreset,
  rustPreset,
  sqlPreset,
  webPreset,
} from "../presets/index.js";

/** filename → contents, like tabs in an IDE. */
const FILES = /** @type {Record<string, string>} */ ({
  "main.rs": `use std::collections::HashMap;

/// Counts how often each word occurs.
fn word_count(text: &str) -> HashMap<&str, usize> {
    let mut counts = HashMap::new();
    for word in text.split_whitespace() {
        *counts.entry(word).or_insert(0) += 1;
    }
    counts
}
`,
  "app.tsx": `interface Props {
  name: string;
  count?: number;
}

export function Greeting({ name, count = 0 }: Props) {
  return <p className="greeting">Hello, {name}! ({count})</p>;
}
`,
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <style>
      body { margin: 0; font-family: system-ui; }
    </style>
  </head>
  <body>
    <script type="module">
      const app = document.querySelector("#app");
    </script>
  </body>
</html>
`,
  "styles.scss": `$accent: #1d5d78;

.card {
  &:hover {
    outline: 2px solid $accent;
  }
}
`,
  "main.py": `from dataclasses import dataclass


@dataclass
class Point:
    x: float
    y: float

    def distance(self, other: "Point") -> float:
        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5
`,
  "query.sql": `SELECT u.id, u.email, COUNT(o.id) AS orders
FROM users AS u
LEFT JOIN orders AS o ON o.user_id = u.id
WHERE u.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.id
ORDER BY orders DESC
LIMIT 10;
`,
  "README.md": `# code-editor

Fenced code is highlighted with its own grammar:

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}"
\`\`\`

- **bold**, _italic_, \`inline code\`
`,
  "Program.cs": `using System;

namespace Demo
{
    public record Point(double X, double Y);

    public static class Program
    {
        public static void Main(string[] args)
        {
            var p = new Point(3, 4);
            Console.WriteLine($"Length: {Math.Sqrt(p.X * p.X + p.Y * p.Y)}");
        }
    }
}
`,
  "main.go": `package main

import "fmt"

func main() {
	for i := 0; i < 3; i++ {
		fmt.Println("tick", i)
	}
}
`,
  "main.cpp": `#include <iostream>
#include <vector>

int main() {
    std::vector<int> values{1, 2, 3};
    for (const auto& value : values) {
        std::cout << value << '\\n';
    }
    return 0;
}
`,
  "Main.kt": `data class User(val name: String, val age: Int)

fun main() {
    val users = listOf(User("Ada", 36), User("Linus", 28))
    println(users.sortedBy { it.age })
}
`,
  "notes.txt": `No plugin contributes .txt, so this stays plain text.`,
});

const PRESETS = {
  all: allPreset,
  web: webPreset,
  python: pythonPreset,
  rust: rustPreset,
  go: goPreset,
  cpp: cppPreset,
  dotnet: dotnetPreset,
  jvm: jvmPreset,
  sql: sqlPreset,
};

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Code Editor/Presets",
  component: "cdx-code-editor",
  argTypes: {
    filename: { control: "select", options: Object.keys(FILES) },
    preset: { control: "select", options: Object.keys(PRESETS) },
  },
  args: {
    filename: "main.rs",
    preset: "all",
  },
  render: (args) => html`
    <cdx-code-editor
      style="block-size: 22rem"
      label=${args.filename}
      .plugins=${PRESETS[/** @type {keyof typeof PRESETS} */ (args.preset)]}
      filename=${args.filename}
      .value=${FILES[args.filename]}
      ><cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
    </cdx-code-editor>
  `,
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** The language comes from the file extension. A preset outside the file's stack (e.g. `web` on
 *  `main.rs`) has no grammar for it, so the file renders as plain text.
 *  @type {Story} */
export const ByFilename = {};

/** `language` wins over `filename` — here a `.txt` file is forced to Rust.
 *  @type {Story} */
export const ExplicitLanguage = {
  render: () => html`
    <cdx-code-editor
      style="block-size: 12rem"
      label="notes.txt"
      .plugins=${allPreset}
      filename="notes.txt"
      language="rust"
      .value=${'fn main() {\n    println!("forced to Rust");\n}\n'}
      ><cdx-footer slot="footer" encoding="UTF-8"></cdx-footer>
    </cdx-code-editor>
  `,
};
