package config

func (l Listen) Matches(event string, data map[string]string) bool {
	if l.Event != event {
		return false
	}
	for key, want := range l.When {
		if data[key] != want {
			return false
		}
	}
	return true
}

type Listener struct {
	Department Department
	Agent      Agent
}

func Listeners(departments []Department, event string, data map[string]string) []Listener {
	var found []Listener
	for _, d := range departments {
		for _, a := range d.Agents {
			for _, listen := range a.Listens {
				if listen.Matches(event, data) {
					found = append(found, Listener{Department: d, Agent: a})
					break
				}
			}
		}
	}
	return found
}

func (a Agent) OutcomeNamed(name string) (Outcome, bool) {
	for _, outcome := range a.Outcomes {
		if outcome.Name == name {
			return outcome, true
		}
	}
	return Outcome{}, false
}
