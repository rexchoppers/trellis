export namespace config {
	
	export class Listen {
	    event: string;
	    when: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new Listen(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.event = source["event"];
	        this.when = source["when"];
	    }
	}
	export class StepDef {
	    name: string;
	    tools: string[];
	
	    static createFrom(source: any = {}) {
	        return new StepDef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.tools = source["tools"];
	    }
	}
	export class Outcome {
	    name: string;
	    label: string;
	    publish: string;
	    with: Record<string, string>;
	    back: boolean;
	    confirm: boolean;
	    fields: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new Outcome(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.label = source["label"];
	        this.publish = source["publish"];
	        this.with = source["with"];
	        this.back = source["back"];
	        this.confirm = source["confirm"];
	        this.fields = source["fields"];
	    }
	}
	export class Permissions {
	    free: string[];
	    ask: string[];
	
	    static createFrom(source: any = {}) {
	        return new Permissions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.free = source["free"];
	        this.ask = source["ask"];
	    }
	}
	export class Agent {
	    key: string;
	    name: string;
	    task: string;
	    desks: number;
	    order: number;
	    worktree: boolean;
	    branches: string;
	    delegates: string[];
	    every: string;
	    model: string;
	    permissions: Permissions;
	    instructions: string;
	    outcomes: Outcome[];
	    steps: StepDef[];
	    listens: Listen[];
	
	    static createFrom(source: any = {}) {
	        return new Agent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.name = source["name"];
	        this.task = source["task"];
	        this.desks = source["desks"];
	        this.order = source["order"];
	        this.worktree = source["worktree"];
	        this.branches = source["branches"];
	        this.delegates = source["delegates"];
	        this.every = source["every"];
	        this.model = source["model"];
	        this.permissions = this.convertValues(source["permissions"], Permissions);
	        this.instructions = source["instructions"];
	        this.outcomes = this.convertValues(source["outcomes"], Outcome);
	        this.steps = this.convertValues(source["steps"], StepDef);
	        this.listens = this.convertValues(source["listens"], Listen);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Department {
	    key: string;
	    name: string;
	    colour: string;
	    order: number;
	    agents: Agent[];
	
	    static createFrom(source: any = {}) {
	        return new Department(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.name = source["name"];
	        this.colour = source["colour"];
	        this.order = source["order"];
	        this.agents = this.convertValues(source["agents"], Agent);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class NPC {
	    key: string;
	    name: string;
	    colour: string;
	    place: string;
	    does: string;
	    carries: string[];
	    lines: string[];
	
	    static createFrom(source: any = {}) {
	        return new NPC(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.name = source["name"];
	        this.colour = source["colour"];
	        this.place = source["place"];
	        this.does = source["does"];
	        this.carries = source["carries"];
	        this.lines = source["lines"];
	    }
	}
	
	
	export class Place {
	    key: string;
	    name: string;
	    kind: string;
	    order: number;
	
	    static createFrom(source: any = {}) {
	        return new Place(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.order = source["order"];
	    }
	}

}

export namespace jobs {
	
	export class Entry {
	    id: number;
	    // Go type: time
	    at: any;
	    from: string;
	    kind: string;
	    by?: string;
	    text?: string;
	    tool?: string;
	    input?: string;
	    decision?: string;
	    outcome?: string;
	    data?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new Entry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.at = this.convertValues(source["at"], null);
	        this.from = source["from"];
	        this.kind = source["kind"];
	        this.by = source["by"];
	        this.text = source["text"];
	        this.tool = source["tool"];
	        this.input = source["input"];
	        this.decision = source["decision"];
	        this.outcome = source["outcome"];
	        this.data = source["data"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Link {
	    job: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new Link(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.job = source["job"];
	        this.name = source["name"];
	    }
	}
	export class Produced {
	    kind: string;
	    label: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new Produced(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.label = source["label"];
	        this.url = source["url"];
	    }
	}
	export class Step {
	    name: string;
	    status: string;
	    note: string;
	
	    static createFrom(source: any = {}) {
	        return new Step(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.status = source["status"];
	        this.note = source["note"];
	    }
	}
	export class Origin {
	    event: string;
	    job: string;
	    agent: string;
	    department: string;
	
	    static createFrom(source: any = {}) {
	        return new Origin(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.event = source["event"];
	        this.job = source["job"];
	        this.agent = source["agent"];
	        this.department = source["department"];
	    }
	}
	export class Job {
	    id: string;
	    department: string;
	    agent: string;
	    task: string;
	    state: string;
	    reason: string;
	    session: string;
	    branch: string;
	    pr: string;
	    outcome: string;
	    data: Record<string, string>;
	    from?: Origin;
	    progress: Step[];
	    doing: string;
	    produced: Produced[];
	    // Go type: time
	    created: any;
	    // Go type: time
	    nextWake: any;
	    parent?: Link;
	    children: Link[];
	
	    static createFrom(source: any = {}) {
	        return new Job(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.department = source["department"];
	        this.agent = source["agent"];
	        this.task = source["task"];
	        this.state = source["state"];
	        this.reason = source["reason"];
	        this.session = source["session"];
	        this.branch = source["branch"];
	        this.pr = source["pr"];
	        this.outcome = source["outcome"];
	        this.data = source["data"];
	        this.from = this.convertValues(source["from"], Origin);
	        this.progress = this.convertValues(source["progress"], Step);
	        this.doing = source["doing"];
	        this.produced = this.convertValues(source["produced"], Produced);
	        this.created = this.convertValues(source["created"], null);
	        this.nextWake = this.convertValues(source["nextWake"], null);
	        this.parent = this.convertValues(source["parent"], Link);
	        this.children = this.convertValues(source["children"], Link);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	

}

export namespace setup {
	
	export class ProjectInput {
	    path: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new ProjectInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	    }
	}
	export class ProjectStatus {
	    path: string;
	    name: string;
	    places: config.Place[];
	    npcs: config.NPC[];
	    missing: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ProjectStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.places = this.convertValues(source["places"], config.Place);
	        this.npcs = this.convertValues(source["npcs"], config.NPC);
	        this.missing = source["missing"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

