// Agents Farm - learning mode: turns each event into a plain English
// sentence, for the log and the speech bubbles above the farmers.

// Known commands. The first pattern that matches the start of the command wins.
// ^ means "at the start", \b "end of a word", (a|b) "a or b", ? "maybe".
const COMMAND_SENTENCES = [
  [/^((python3? -m )?pytest|npm (run )?test)\b/, "running the tests"],
  [/^git status\b/, "checking which files changed"],
  [/^git diff\b/, "looking at what changed"],
  [/^git log\b/, "reading the project history"],
  [/^git add\b/, "picking files for the next commit"],
  [/^git commit\b/, "saving a snapshot (commit)"],
  [/^git push\b/, "uploading commits to GitHub"],
  [/^git pull\b/, "downloading the newest commits"],
  [/^(pip3?|npm|brew) install\b/, "installing packages"],
  [/^ls\b/, "listing files"],
  [/^cd\b/, "moving to another folder"],
  [/^mkdir\b/, "making a new folder"],
  [/^rm\b/, "deleting files"],
  [/^(grep|rg)\b/, "searching the code"],
  [/^find\b/, "looking for files"],
  [/^(cat|head|tail)\b/, "reading a file"],
  [/^(curl|wget)\b/, "downloading from the internet"],
  [/^python3?\b/, "running a Python program"],
  [/^node\b/, "running a JavaScript program"],
];

// What the farmer is doing, in words: "reading README.md"
function activity(event) {
  if (event.action === "read") return "reading " + event.file;
  if (event.action === "edit") return "editing " + event.file;
  const command = (event.command || "").trim();
  for (const [pattern, sentence] of COMMAND_SENTENCES) {
    if (pattern.test(command)) return sentence;
  }
  if (command === "") return "running a command";
  return "running a command (" + command.split(/\s+/)[0] + ")"; // unknown: name the program
}

// The full sentence: "Reading README.md" or "Finished reading README.md"
function describe(event) {
  if (event.action === "done") return "All done, going home";
  const words = activity(event);
  if (event.phase === "end") return "Finished " + words;
  return words[0].toUpperCase() + words.slice(1);
}

// ---------- The on/off switch (top bar) ----------
// Remembered in this browser with localStorage. That can fail (private
// windows, blocked storage), so every use is wrapped in try/catch.

const learningBox = document.getElementById("learning-mode");

function isLearning() {
  return learningBox.checked;
}

function setupLearningSwitch() {
  try {
    learningBox.checked = localStorage.getItem("learning-mode") !== "off";
  } catch {}
  learningBox.addEventListener("change", () => {
    try {
      localStorage.setItem("learning-mode", isLearning() ? "on" : "off");
    } catch {}
    refreshLog(); // in agents.js: rewrite the old lines in the new style
  });
}
