//go:build darwin

package main

// Wails uses UTType in its file dialogs but does not link the framework that provides it.

// #cgo LDFLAGS: -framework UniformTypeIdentifiers
import "C"
