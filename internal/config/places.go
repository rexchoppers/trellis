package config

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Place struct {
	Key   string `yaml:"-" json:"key"`
	Name  string `yaml:"name" json:"name"`
	Kind  string `yaml:"kind" json:"kind"`
	Order int    `yaml:"order" json:"order"`
}

// Does is serve or sit (at Place) or patrol. Lines may use {who} (someone nearby) and {room} (a nearby department).
type NPC struct {
	Key     string   `yaml:"-" json:"key"`
	Name    string   `yaml:"name" json:"name"`
	Colour  string   `yaml:"colour" json:"colour"`
	Place   string   `yaml:"place,omitempty" json:"place"`
	Does    string   `yaml:"does" json:"does"`
	Carries []string `yaml:"carries,omitempty" json:"carries"`
	Lines   []string `yaml:"lines,omitempty" json:"lines"`
}

func LoadPlaces(root string) ([]Place, error) {
	places, err := loadEach[Place](filepath.Join(projectDir(root), "places"), func(p *Place, key string) { p.Key = key })
	sort.SliceStable(places, func(i, j int) bool { return places[i].Order < places[j].Order })
	return places, err
}

func LoadNPCs(root string) ([]NPC, error) {
	return loadEach[NPC](filepath.Join(projectDir(root), "npcs"), func(n *NPC, key string) { n.Key = key })
}

func loadEach[T any](dir string, keyed func(*T, string)) ([]T, error) {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return []T{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := make([]T, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if !entry.Type().IsRegular() || strings.HasPrefix(name, ".") || !strings.HasSuffix(name, ".yaml") {
			continue
		}
		var item T
		if _, err := readYAML(filepath.Join(dir, name), &item); err != nil {
			return nil, err
		}
		keyed(&item, strings.TrimSuffix(name, ".yaml"))
		out = append(out, item)
	}
	return out, nil
}
