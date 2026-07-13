package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/rexchoppers/trellis/internal/api"
	"github.com/rexchoppers/trellis/internal/engine"
	"github.com/rexchoppers/trellis/internal/linear"
	"github.com/rexchoppers/trellis/internal/store"
	"github.com/rexchoppers/trellis/web"
)

// loadDotEnv loads KEY=VALUE lines from <workdir>/.env into the environment;
// real environment variables win.
func loadDotEnv(workdir string) {
	raw, err := os.ReadFile(filepath.Join(workdir, ".env"))
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if os.Getenv(key) == "" {
			os.Setenv(key, value)
		}
	}
}

func main() {
	dataDir := flag.String("data", "trellis-data", "path to the data folder (one JSON file per record)")
	port := flag.Int("port", 0, "port to listen on (0 picks a free port)")
	noBrowser := flag.Bool("no-browser", false, "do not open the browser on startup")
	workdirFlag := flag.String("workdir", "", "directory agents and git actions run in (default: the directory trellis is launched from)")
	flag.Parse()

	workdir := *workdirFlag
	if workdir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			log.Fatalf("resolve working directory: %v", err)
		}
		workdir = cwd
	}
	absWorkdir, err := filepath.Abs(workdir)
	if err != nil {
		log.Fatalf("resolve workdir %q: %v", workdir, err)
	}
	workdir = absWorkdir
	if info, err := os.Stat(workdir); err != nil || !info.IsDir() {
		log.Fatalf("workdir %q is not a directory", workdir)
	}
	loadDotEnv(workdir)

	st, err := store.New(*dataDir)
	if err != nil {
		log.Fatalf("open data folder: %v", err)
	}

	eng := engine.New(st, engine.ClaudeCLI{Bin: "claude"})
	eng.DefaultWorkdir = workdir
	hub := api.NewHub()

	var linearClient *linear.Client
	if key := os.Getenv("LINEAR_API_KEY"); key != "" {
		linearClient = &linear.Client{APIKey: key}
		fmt.Println("Linear: enabled (LINEAR_API_KEY found)")
	} else {
		fmt.Printf("Linear: disabled, no LINEAR_API_KEY in the environment or %s/.env\n", workdir)
	}
	eng.Actions = &engine.ActionRunner{Linear: linearClient}
	if linearClient != nil {
		go eng.WatchLinear(15 * time.Second)
	}

	dist, err := fs.Sub(web.Dist, "dist")
	if err != nil {
		log.Fatalf("embedded frontend: %v", err)
	}
	handler := api.New(st, eng, hub, linearClient, dist)

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		log.Fatalf("listen: %v", err)
	}
	url := fmt.Sprintf("http://%s", listener.Addr())
	fmt.Printf("Trellis running at %s (default workdir %s; pipelines can set their own)\n", url, workdir)

	if !*noBrowser {
		openBrowser(url)
	}
	log.Fatal(http.Serve(listener, handler))
}

func openBrowser(url string) {
	bin := "xdg-open"
	if runtime.GOOS == "darwin" {
		bin = "open"
	}
	if err := exec.Command(bin, url).Start(); err != nil {
		log.Printf("open browser: %v", err)
	}
}
