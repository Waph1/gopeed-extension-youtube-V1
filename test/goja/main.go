// Compile and load the production bundle with Gopeed beta.3's JavaScript engine.
// Also execute the M4A writer against Goja's real typed-array implementation.
// Network and browser operations are deliberately not simulated here.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dop251/goja"
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
	checkMusicTags(filepath.Join(filepath.Dir(path), ".."))
	checkMusicAlbum(filepath.Join(filepath.Dir(path), ".."))
}

func checkMusicAlbum(root string) {
	runtime := goja.New()
	source, err := os.ReadFile(filepath.Join(root, "src/lib/music.js"))
	must(err)
	// The matcher uses no host APIs; network responses are supplied by the test.
	_, err = runtime.RunString(strings.ReplaceAll(strings.SplitN(string(source), "\n", 2)[1], "export ", ""))
	must(err)
	test, err := os.ReadFile(filepath.Join(root, "test/goja/music-album.js"))
	must(err)
	_, err = runtime.RunString(string(test))
	must(err)
	if failure := runtime.Get("albumTestFailure").String(); failure != "" {
		panic(failure)
	}
	if !runtime.Get("albumTestFinished").ToBoolean() {
		panic("Album matching stalled with an unresolved promise")
	}
	fmt.Println("Album lookup executes in Goja: exact IDs, Unicode matching, artwork selection and cache verified.")
}

func checkMusicTags(root string) {
	runtime := goja.New()
	run := func(source string) {
		_, err := runtime.RunString(source)
		must(err)
	}
	read := func(path string) string {
		source, err := os.ReadFile(filepath.Join(root, path))
		must(err)
		return string(source)
	}
	// Use the same UTF-8 implementation bundled by the webpack Gopeed plugin.
	run("var exports = {};")
	run(read("node_modules/text-encoding-utf-8/lib/encoding.lib.js"))
	run(strings.ReplaceAll(read("src/lib/m4a-tags.js"), "export function", "function"))
	run(read("test/goja/music-tags.js"))
	if failure := runtime.Get("tagTestFailure").String(); failure != "" {
		panic(failure)
	}
	if !runtime.Get("tagTestFinished").ToBoolean() {
		panic("M4A tagging stalled with an unresolved promise")
	}
	fmt.Println("M4A writer executes in Goja: Unicode tags, one-byte atom names, offsets and media bytes verified.")
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
