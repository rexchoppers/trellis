package main

import (
	"embed"
	"log"

	"github.com/rexchoppers/trellis/internal/config"
	"github.com/rexchoppers/trellis/internal/linear"
	"github.com/rexchoppers/trellis/internal/secrets"
	"github.com/rexchoppers/trellis/internal/setup"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	dir, err := config.DefaultDir()
	if err != nil {
		log.Fatal(err)
	}
	app := NewApp(&setup.Service{
		ConfigDir: dir,
		Secrets:   secrets.Keychain{Service: "trellis"},
		Linear:    linear.NewClient(),
	})

	err = wails.Run(&options.App{
		Title:            "Trellis",
		Width:            1280,
		Height:           820,
		MinWidth:         640,
		MinHeight:        480,
		AssetServer:      &assetserver.Options{Assets: assets},
		BackgroundColour: &options.RGBA{R: 15, G: 14, B: 23, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind:             []interface{}{app},
		Mac: &mac.Options{
			TitleBar:   mac.TitleBarHiddenInset(),
			Appearance: mac.NSAppearanceNameDarkAqua,
			About:      &mac.AboutInfo{Title: "Trellis", Message: "Welcome to the 47th floor"},
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
