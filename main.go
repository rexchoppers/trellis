package main

import (
	"embed"
	"log"

	"github.com/rexchoppers/trellis/internal/config"
	"github.com/rexchoppers/trellis/internal/setup"
	"github.com/rexchoppers/trellis/internal/shellenv"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	application.RegisterEvent[JobChanged]("job")
}

func main() {
	shellenv.UseLoginPath()
	dir, err := config.DefaultDir()
	if err != nil {
		log.Fatal(err)
	}

	app := application.New(application.Options{
		Name:        "Trellis",
		Description: "Welcome to the 47th floor",
		Services:    []application.Service{application.NewService(NewApp(&setup.Service{ConfigDir: dir}))},
		Assets:      application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		Mac:         application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Trellis",
		Width:            1280,
		Height:           820,
		MinWidth:         640,
		MinHeight:        480,
		BackgroundColour: application.NewRGB(15, 14, 23),
		URL:              "/",
		Mac: application.MacWindow{
			TitleBar:   application.MacTitleBarHiddenInset,
			Appearance: application.NSAppearanceNameDarkAqua,
		},
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
