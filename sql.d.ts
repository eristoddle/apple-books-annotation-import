declare module 'sql.js' {
	interface Database {
		prepare(sql: string, params?: any[]): Statement;
		close(): void;
	}
	
	interface Statement {
		step(): boolean;
		getAsObject(): any;
		free(): void;
	}
	
	interface SqlJsStatic {
		Database: new (data?: Uint8Array) => Database;
	}
	
	interface SqlJsConfig {
		locateFile?: (file: string) => string;
		wasmBinary?: Uint8Array;
	}
	
	function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
	export = initSqlJs;
}