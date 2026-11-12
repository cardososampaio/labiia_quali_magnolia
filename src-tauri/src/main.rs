// A windowed program, not a command-line one: without this line Windows opens
// a terminal window next to the program. Development builds keep the terminal
// for their messages.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    magnolia_lib::run()
}
