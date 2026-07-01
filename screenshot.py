#!/usr/bin/env python3
import sys
import subprocess
import os

def main():
    # Forward any command line arguments (e.g. width, height, scale)
    args = sys.argv[1:]
    
    # Resolve absolute paths relative to this script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    js_path = os.path.join(script_dir, "screenshot-podium.js")
    
    # Setup environment variables
    env = os.environ.copy()
    # Resolve the absolute path to the node_modules folder
    env["NODE_PATH"] = os.path.abspath(os.path.join(script_dir, "..", "test", "node_modules"))
    
    cmd = ["node", js_path] + args
    
    try:
        # Run the node process, automatically forwarding stdin/stdout/stderr
        # so you can type Enter to shoot and 'q' to quit.
        process = subprocess.Popen(cmd, env=env)
        process.wait()
    except KeyboardInterrupt:
        # Gracefully handle Ctrl-C exit
        pass
    except Exception as e:
        print(f"Error running screenshot tool: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
