// Compile and load the production bundle with Gopeed beta.3's JavaScript engine.
// Network, browser and media operations are deliberately not simulated here.
package main

import (
	"fmt"
	"github.com/dop251/goja"
	"os"
)

func main() {
	path := "../../dist/index.js"
	if len(os.Args) > 1 {
		path = os.Args[1]
	}
	source, err := os.ReadFile(path)
	must(err)
	program, err := goja.Compile(path, string(source), false)
	must(err)
	runtime := goja.New()
	_, err = runtime.RunString(`
 var registered = {};
 var gopeed = { info: {identity:'Waph1@youtube'}, settings:{}, storage:{get:function(){},set:function(){},remove:function(){}},
   events: {onResolve:function(fn){registered.onResolve=fn;},onStart:function(fn){registered.onStart=fn;},onError:function(fn){registered.onError=fn;}},
   logger:{debug:function(){},info:function(){},warn:function(){},error:function(){}} };
 var console=gopeed.logger;
 var MessageError=Error;
 var fetch=function(){throw Error('Unexpected network call during bundle initialization');};
 var Event=function(){}; var EventTarget=function(){}; var AbortController=function(){};
 var Blob=function(){}; var File=function(){};
 var Headers=function(){}; var Request=function(){}; var Response=function(){};
 var ReadableStream=function(){}; var WritableStream=function(){};
 var setTimeout=function(){}; var clearTimeout=function(){};
 var crypto={getRandomValues:function(a){return a;},randomUUID:function(){return 'test';}};
 `)
	must(err)
	_, err = runtime.RunProgram(program)
	must(err)
	value, err := runtime.RunString(`['onResolve','onStart','onError'].every(function(name){return typeof registered[name]==='function';})`)
	must(err)
	if !value.ToBoolean() {
		panic("missing event handlers")
	}
	fmt.Println("Production bundle compiles and registers all three handlers in Goja.")
}
func must(err error) {
	if err != nil {
		panic(err)
	}
}
