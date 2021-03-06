'use strict';

var chokidar = require('./');
var chai = require('chai');
var expect = chai.expect;
var should = chai.should();
var sinon = require('sinon');
chai.use(require('sinon-chai'));
var fs = require('fs');
var sysPath = require('path');
var os = require('os').platform();

function getFixturePath (subPath) {
  return sysPath.join(__dirname, 'test-fixtures', subPath);
}

var fixturesPath = getFixturePath('');

before(function() {
  try {fs.mkdirSync(fixturesPath, 0x1ed);} catch(err) {}
});

after(function() {
  try {fs.unlinkSync(getFixturePath('change.txt'));} catch(err) {}
  try {fs.unlinkSync(getFixturePath('unlink.txt'));} catch(err) {}
  try {fs.rmdirSync(fixturesPath, 0x1ed);} catch(err) {}
});

describe('chokidar', function() {
  it('should expose public API methods', function() {
    chokidar.FSWatcher.should.be.a('function');
    chokidar.watch.should.be.a('function');
  });

  describe('non-polling', runTests.bind(this, {usePolling: false, useFsEvents: false}));
  describe('polling', runTests.bind(this, {usePolling: true}));
  if (os === 'darwin') describe('fsevents', runTests.bind(this, {useFsEvents: true}));
});

function runTests (options) {
  this.timeout(3000);
  if (!options) options = {};

  var delayTime = options.usePolling ? 300 : options.useFsEvents ? 200 : 250;
  var ddmult = options.usePolling ? 3 : 1.5;
  function delay (fn) { return setTimeout(fn, delayTime); }
  function ddelay (fn) { return setTimeout(fn, delayTime * ddmult); }

  options.persistent = true;

  function clean(done) {
    fs.writeFileSync(getFixturePath('change.txt'), 'b');
    fs.writeFileSync(getFixturePath('unlink.txt'), 'b');
    try {fs.unlinkSync(getFixturePath('add.txt'));} catch(err) {}
    try {fs.unlinkSync(getFixturePath('moved.txt'));} catch(err) {}
    try {fs.unlinkSync(getFixturePath('subdir/add.txt'));} catch(err) {}
    try {fs.unlinkSync(getFixturePath('subdir/dir/ignored.txt'));} catch(err) {}
    try {fs.rmdirSync(getFixturePath('subdir/dir'));} catch(err) {}
    try {fs.rmdirSync(getFixturePath('subdir'));} catch(err) {}
    if (done) ddelay(done);
  }

  describe('watch', function() {
    var rawSpy;
    beforeEach(function(done) {
      this.readySpy = sinon.spy(function readySpy(){});
      rawSpy = sinon.spy(function rawSpy(){});
      this.watcher = chokidar.watch(fixturesPath, options)
        .on('ready', this.readySpy)
        .on('raw', rawSpy);
      ddelay(done);
    });
    afterEach(function(done) {
      this.watcher.close();
      this.readySpy.should.have.been.calledOnce;
      rawSpy = undefined;
      delete this.watcher;
      ddelay(done);
    });
    before(clean);
    after(function() {
      clean();
      fs.writeFileSync(getFixturePath('change.txt'), 'a');
      fs.writeFileSync(getFixturePath('unlink.txt'), 'a');
    });
    it('should produce an instance of chokidar.FSWatcher', function() {
      this.watcher.should.be.an['instanceof'](chokidar.FSWatcher);
    });
    it('should expose public API methods', function() {
      this.watcher.on.should.be.a('function');
      this.watcher.emit.should.be.a('function');
      this.watcher.add.should.be.a('function');
      this.watcher.close.should.be.a('function');
    });
    it('should emit `add` event when file was added', function(done) {
      var spy = sinon.spy();
      var testPath = getFixturePath('add.txt');
      this.watcher.on('add', spy);
      delay(function() {
        spy.should.not.have.been.called;
        fs.writeFileSync(testPath, 'hello');
        delay(function() {
          spy.should.have.been.calledOnce;
          spy.should.have.been.calledWith(testPath);
          rawSpy.should.have.been.called;
          done();
        });
      });
    });
    it('should emit `addDir` event when directory was added', function(done) {
      var spy = sinon.spy();
      var testDir = getFixturePath('subdir');
      this.watcher.on('addDir', spy);
      delay(function() {
        spy.should.not.have.been.called;
        fs.mkdirSync(testDir, 0x1ed);
        delay(function() {
          spy.should.have.been.calledOnce;
          spy.should.have.been.calledWith(testDir);
          rawSpy.should.have.been.called;
          done();
        });
      });
    });
    it('should emit `change` event when file was changed', function(done) {
      var spy = sinon.spy();
      var testPath = getFixturePath('change.txt');
      this.watcher.on('change', spy);
      delay(function() {
        spy.should.not.have.been.called;
        fs.writeFileSync(testPath, 'c');
        delay(function() {
          // prevent stray unpredictable fs.watch events from making test fail
          if (options.usePolling || options.useFsEvents) {
            spy.should.have.been.calledOnce;
          }
          spy.should.have.been.calledWith(testPath);
          rawSpy.should.have.been.called;
          done();
        });
      });
    });
    it('should emit `unlink` event when file was removed', function(done) {
      var spy = sinon.spy();
      var testPath = getFixturePath('unlink.txt');
      this.watcher.on('unlink', spy);
      delay(function() {
        spy.should.not.have.been.called;
        fs.unlinkSync(testPath);
        delay(function() {
          spy.should.have.been.calledOnce;
          spy.should.have.been.calledWith(testPath);
          rawSpy.should.have.been.called;
          done();
        });
      });
    });
    it('should emit `unlinkDir` event when a directory was removed', function(done) {
      var spy = sinon.spy();
      var testDir = getFixturePath('subdir');
      this.watcher.on('unlinkDir', spy);
      delay(function() {
        fs.rmdirSync(testDir);
        delay(function() {
          spy.should.have.been.calledOnce;
          spy.should.have.been.calledWith(testDir);
          rawSpy.should.have.been.called;
          done();
        });
      });
    });
    it('should emit `unlink` and `add` events when a file is renamed', function(done) {
      var unlinkSpy = sinon.spy(function unlink(){});
      var addSpy = sinon.spy(function add(){});
      var testPath = getFixturePath('change.txt');
      var newPath = getFixturePath('moved.txt');
      this.watcher.on('unlink', unlinkSpy).on('add', addSpy);
      delay(function() {
        unlinkSpy.should.not.have.been.called;
        addSpy.should.not.have.been.called;
        fs.renameSync(testPath, newPath);
        delay(function() {
          unlinkSpy.should.have.been.calledOnce;
          unlinkSpy.should.have.been.calledWith(testPath);
          addSpy.should.have.been.calledOnce;
          addSpy.should.have.been.calledWith(newPath);
          fs.renameSync(newPath, testPath);
          rawSpy.should.have.been.called;
          done();
        });
      });
    });
    it('should survive ENOENT for missing subdirectories', function(done) {
      var testDir;
      testDir = getFixturePath('subdir');
      this.watcher.add(testDir);
      delay(done);
    });
    it('should notice when a file appears in a new directory', function(done) {
      var spy = sinon.spy();
      var testDir = getFixturePath('subdir');
      var testPath = getFixturePath('subdir/add.txt');
      this.watcher.on('add', spy);
      delay(function() {
        spy.should.not.have.been.called;
        fs.mkdirSync(testDir, 0x1ed);
        fs.writeFileSync(testPath, 'hello');
        delay(function() {
          spy.should.have.been.calledOnce;
          spy.should.have.been.calledWith(testPath);
          rawSpy.should.have.been.called;
          done();
        });
      });
    });
  });
  describe('watch individual files', function() {
    beforeEach(clean);
    after(clean);
    it('should detect changes', function(done) {
      var spy = sinon.spy();
      var readySpy = sinon.spy();
      var testPath = getFixturePath('change.txt');
      var watcher = chokidar.watch(testPath, options)
        .on('change', spy)
        .on('ready', readySpy);
      ddelay(function() {
        fs.writeFileSync(testPath, 'c');
        delay(function() {
          watcher.close();
          readySpy.should.have.been.calledOnce;
          spy.should.have.always.been.calledWith(testPath);
          done();
        });
      });
    });
    it('should detect unlinks', function(done) {
      var spy = sinon.spy();
      var testPath = getFixturePath('unlink.txt');
      var watcher = chokidar.watch(testPath, options).on('unlink', spy);
      delay(function() {
        fs.unlinkSync(testPath);
        delay(function() {
          spy.should.have.been.calledWith(testPath);
          watcher.close();
          done();
        });
      });
    });
    it('should detect unlink and re-add', function(done) {
      var unlinkSpy = sinon.spy(function unlink(){});
      var addSpy = sinon.spy(function add(){});
      var testPath = getFixturePath('unlink.txt');
      var watcher = chokidar.watch(testPath, options)
        .on('unlink', unlinkSpy)
        .on('add', addSpy);
      delay(function() {
        fs.unlinkSync(testPath);
        delay(function() {
          unlinkSpy.should.have.been.calledWith(testPath);
          delay(function() {
            addSpy.should.have.been.calledWith(testPath);
            watcher.close();
            done();
          });
        });
      });
    });
    it('should ignore unwatched siblings', function(done) {
      var spy = sinon.spy();
      var testPath = getFixturePath('add.txt');
      var siblingPath = getFixturePath('change.txt');
      var watcher = chokidar.watch(testPath, options).on('all', spy);
      delay(function() {
        fs.writeFileSync(siblingPath, 'c');
        delay(function() {
          spy.should.not.have.been.called;
          fs.writeFileSync(testPath, 'a');
          delay(function() {
            spy.should.have.been.calledWith('add', testPath);
            watcher.close();
            done();
          });
        });
      });
    });
  });
  describe('watch non-existent paths', function() {
    beforeEach(clean);
    after(clean);
    it('should watch non-existent file and detect add', function(done) {
      var spy = sinon.spy();
      var readySpy = sinon.spy();
      var testPath = getFixturePath('add.txt');
      var watcher = chokidar.watch(testPath, options)
        .on('add', spy)
        .on('ready', readySpy);
      // polling takes a bit longer here
      ddelay(function() {
        fs.writeFileSync(testPath, 'a');
        ddelay(function() {
          watcher.close();
          spy.should.have.been.calledWith(testPath);
          readySpy.should.have.been.calledOnce;
          done();
        });
      });
    });
    it('should watch non-existent dir and detect addDir/add', function(done) {
      var spy = sinon.spy();
      var readySpy = sinon.spy();
      var testDir = getFixturePath('subdir');
      var testPath = getFixturePath('subdir/add.txt');
      delay(function() {
        var watcher = chokidar.watch(testDir, options)
          .on('all', spy)
          .on('ready', readySpy);
        ddelay(function() {
          spy.should.not.have.been.called;
          readySpy.should.have.been.calledOnce;
          fs.mkdirSync(testDir, 0x1ed);
          fs.writeFileSync(testPath, 'hello');
          ddelay(function() {
            watcher.close();
            spy.should.have.been.calledWith('addDir', testDir);
            spy.should.have.been.calledWith('add', testPath);
            done();
          });
        });
      });
    });
  });
  describe('watch glob patterns', function() {
    beforeEach(clean);
    after(clean);
    it('should correctly watch and emit based on glob input', function(done) {
      var spy = sinon.spy();
      var readySpy = sinon.spy();
      var testPath = getFixturePath('*a*.txt');
      var addPath = getFixturePath('add.txt');
      var changePath = getFixturePath('change.txt');
      delay(function() {
        var watcher = chokidar.watch(testPath, options)
          .on('all', spy)
          .on('ready', readySpy);
        ddelay(function() {
          spy.should.have.been.calledWith('add', changePath);
          fs.writeFileSync(addPath, 'a');
          fs.writeFileSync(changePath, 'c');
          ddelay(function() {
            watcher.close();
            spy.should.have.been.calledWith('add', addPath);
            spy.should.have.been.calledWith('change', changePath);
            spy.should.not.have.been.calledWith('add', getFixturePath('unlink.txt'));
            spy.should.not.have.been.calledWith('addDir');
            readySpy.should.have.been.calledOnce;
            done();
          });
        });
      });
    });
    it('should respect negated glob patterns', function(done) {
      var spy = sinon.spy();
      var testPath = getFixturePath('*');
      var negatedPath = '!' + getFixturePath('*a*.txt');
      var unlinkPath = getFixturePath('unlink.txt');
      var watcher = chokidar.watch([testPath, negatedPath], options).on('all', spy);
      delay(function() {
        spy.should.have.been.calledOnce;
        spy.should.have.been.calledWith('add', unlinkPath);
        fs.unlinkSync(unlinkPath);
        ddelay(function() {
          watcher.close();
          spy.should.have.been.calledTwice;
          spy.should.have.been.calledWith('unlink', unlinkPath);
          done();
        });
      });
    });
  });
  describe('watch symlinks', function() {
    if (os === 'win32') return;
    var linkedDir = sysPath.resolve(fixturesPath, '..', 'test-fixtures-link');
    before(function() {
      clean();
      try {fs.symlinkSync(fixturesPath, linkedDir);} catch(err) {}
      try {fs.mkdirSync(getFixturePath('subdir'), 0x1ed);} catch(err) {}
      fs.writeFileSync(getFixturePath('subdir/add.txt'), 'b');
    });
    after(function() {
      try {fs.unlinkSync(linkedDir);} catch(err) {}
      try {fs.unlinkSync(getFixturePath('link'));} catch(err) {}
      try {fs.unlinkSync(getFixturePath('subdir/add.txt'));} catch(err) {}
      try {fs.rmdirSync(getFixturePath('subdir'));} catch(err) {}
    });
    it('should watch symlinked dirs', function(done) {
      var dirSpy = sinon.spy(function dirSpy(){});
      var addSpy = sinon.spy(function addSpy(){});
      var readySpy = sinon.spy(function readySpy(){});
      var watcher = chokidar.watch(linkedDir, options)
        .on('addDir', dirSpy)
        .on('add', addSpy)
        .on('ready', readySpy);
      delay(function() {
        watcher.close();
        readySpy.should.have.been.calledOnce;
        dirSpy.should.have.been.calledWith(linkedDir);
        addSpy.should.have.been.calledWith(sysPath.join(linkedDir, 'change.txt'));
        addSpy.should.have.been.calledWith(sysPath.join(linkedDir, 'unlink.txt'));
        done();
      });
    });
    it('should watch symlinked files', function(done) {
      var spy = sinon.spy();
      var changePath = getFixturePath('change.txt');
      var linkPath = getFixturePath('link.txt');
      fs.symlinkSync(changePath, linkPath);
      delay(function() {
        var watcher = chokidar.watch(linkPath, options).on('all', spy);
        ddelay(function() {
          fs.writeFileSync(changePath, 'c');
          ddelay(function() {
            watcher.close();
            fs.unlinkSync(linkPath);
            spy.should.have.been.calledWith('add', linkPath);
            spy.should.have.been.calledWith('change', linkPath);
            done();
          });
        });
      });
    });
    it('should follow symlinked files within a normal dir', function(done) {
      var spy = sinon.spy();
      var changePath = getFixturePath('change.txt');
      var linkPath = getFixturePath('subdir/link.txt');
      fs.symlinkSync(changePath, linkPath);
      var watcher = chokidar.watch(getFixturePath('subdir'), options)
        .on('all', spy);
      ddelay(function() {
        fs.writeFileSync(changePath, 'c');
        ddelay(function() {
          watcher.close();
          fs.unlinkSync(linkPath);
          spy.should.have.been.calledWith('add', linkPath);
          spy.should.have.been.calledWith('change', linkPath);
          done();
        });
      });
    });
    it('should watch paths with a symlinked parent', function(done) {
      var spy = sinon.spy();
      var testDir = sysPath.join(linkedDir, 'subdir');
      var testFile = sysPath.join(testDir, 'add.txt');
      var watcher = chokidar.watch(testDir, options).on('all', spy);
      ddelay(function() {
        spy.should.have.been.calledWith('addDir', testDir);
        spy.should.have.been.calledWith('add', testFile);
        fs.writeFileSync(getFixturePath('subdir/add.txt'), 'c');
        ddelay(function() {
          watcher.close();
          spy.should.have.been.calledWith('change', testFile);
          done();
        });
      });
    });
    it('should not recurse indefinitely on circular symlinks', function(done) {
      var spy = sinon.spy();
      fs.symlinkSync(fixturesPath, getFixturePath('subdir/circular'));
      var watcher = chokidar.watch(fixturesPath, options).on('ready', spy);
      delay(function() {
        fs.unlinkSync(getFixturePath('subdir/circular'));
        watcher.close();
        spy.should.have.been.calledOnce;
        done();
      });
    });
    it('should recognize changes following symlinked dirs', function(done) {
      var spy = sinon.spy(function changeSpy(){});
      var watcher = chokidar.watch(linkedDir, options).on('change', spy);
      delay(function() {
        fs.writeFileSync(getFixturePath('change.txt'), 'c');
        delay(function() {
          watcher.close();
          spy.should.have.been.calledWith(sysPath.join(linkedDir, 'change.txt'));
          done();
        });
      });
    });
    it('should follow newly created symlinks', function(done) {
      var spy = sinon.spy();
      options.ignoreInitial = true;
      var watcher = chokidar.watch(fixturesPath, options).on('all', spy);
      delay(function() {
        fs.symlinkSync(getFixturePath('subdir'), getFixturePath('link'));
        delay(function() {
          watcher.close();
          delete options.ignoreInitial;
          spy.should.have.been.calledWith('addDir', getFixturePath('link'));
          spy.should.have.been.calledWith('add', getFixturePath('link/add.txt'));
          done();
        });
      });
    });
    it('should watch symlinks as files when followSymlinks:false', function(done) {
      var spy = sinon.spy();
      options.followSymlinks = false;
      var watcher = chokidar.watch(linkedDir, options).on('all', spy);
      delay(function() {
        watcher.close();
        delete options.followSymlinks;
        spy.should.not.have.been.calledWith('addDir');
        spy.should.have.been.calledWith('add', linkedDir);
        spy.should.have.been.calledOnce;
        fs.unlinkSync(linkedDir);
        done();
      });
    });
    it('should not reuse watcher when following a symlink to elsewhere', function(done) {
      var spy = sinon.spy();
      var linkedPath = getFixturePath('outty_dir');
      var linkedFilePath = sysPath.join(linkedPath, 'text.txt');
      fs.mkdirSync(linkedPath, 0x1ed);
      fs.writeFileSync(linkedFilePath, 'c');
      var linkPath = getFixturePath('subdir/subsub');
      fs.symlinkSync(linkedPath, linkPath);
      var previousWatcher = chokidar.watch(getFixturePath('subdir'), options);
      delay(function() {
        var watchedPath = getFixturePath('subdir/subsub/text.txt');
        var watcher = chokidar.watch(watchedPath, options).on('all', spy);
        ddelay(function() {
          fs.writeFileSync(linkedFilePath, 'd');
          ddelay(function() {
            watcher.close();
            previousWatcher.close();
            fs.unlinkSync(linkPath);
            fs.unlinkSync(linkedFilePath);
            fs.rmdirSync(linkedPath);
            spy.should.have.been.calledWith('change', watchedPath);
            done();
          });
        });
      });
    });
  });
  describe('watch options', function() {
    beforeEach(clean);
    after(clean);
    describe('ignoreInitial:true', function() {
      before(function() { options.ignoreInitial = true; });
      after(function() { delete options.ignoreInitial; });
      it('should ignore inital add events', function(done) {
        var spy = sinon.spy();
        var readySpy = sinon.spy();
        var watcher = chokidar.watch(fixturesPath, options)
          .on('add', spy)
          .on('ready', readySpy);
        delay(function() {
          watcher.close();
          readySpy.should.have.been.calledOnce;
          spy.should.not.have.been.called;
          done();
        });
      });
      it('should ignore add events on a subsequent .add()', function(done) {
        var spy = sinon.spy();
        var readySpy = sinon.spy();
        var watcher = chokidar.watch(getFixturePath('subdir'), options)
          .on('add', spy)
          .on('ready', readySpy);
        delay(function() {
          watcher.add(fixturesPath);
          delay(function() {
            watcher.close();
            readySpy.should.have.been.calledOnce;
            spy.should.not.have.been.called;
            done();
          });
        });
      });
      it('should notice when a file appears in an empty directory', function(done) {
        var spy = sinon.spy();
        var testDir = getFixturePath('subdir');
        var testPath = getFixturePath('subdir/add.txt');
        var watcher = chokidar.watch(fixturesPath, options).on('add', spy);
        delay(function() {
          spy.should.not.have.been.called;
          fs.mkdirSync(testDir, 0x1ed);
          fs.writeFileSync(testPath, 'hello');
          delay(function() {
            watcher.close();
            spy.should.have.been.calledOnce;
            spy.should.have.been.calledWith(testPath);
            done();
          });
        });
      });
      it('should emit a change on a preexisting file as a change', function(done) {
        var spy = sinon.spy();
        var watcher = chokidar.watch(fixturesPath, options).on('all', spy);
        delay(function() {
          spy.should.not.have.been.called;
          fs.writeFileSync(getFixturePath('change.txt'), 'c');
          delay(function() {
            watcher.close();
            spy.should.have.been.calledWith('change', getFixturePath('change.txt'));
            spy.should.not.have.been.calledWith('add');
            done();
          });
        });
      });
    });
    describe('ignoreInitial:false', function() {
      var watcher;
      before(function() { options.ignoreInitial = false; });
      afterEach(function() { watcher.close(); });
      after(function() { delete options.ignoreInitial; });
      it('should emit `add` events for preexisting files', function(done) {
        var spy = sinon.spy();
        watcher = chokidar.watch(fixturesPath, options).on('add', spy);
        var readySpy = sinon.spy();
        watcher.on('ready', readySpy);
        delay(function() {
          spy.should.have.been.calledTwice;
          readySpy.should.have.been.calledOnce;
          done();
        });
      });
      it('should emit `addDir` event for watched dir', function(done) {
        var spy = sinon.spy();
        watcher = chokidar.watch(fixturesPath, options).on('addDir', spy);
        delay(function() {
          spy.should.have.been.calledOnce;
          spy.should.have.been.calledWith(fixturesPath);
          done();
        });
      });
      it('should emit `addDir` events for preexisting dirs', function(done) {
        var spy = sinon.spy();
        fs.mkdirSync(getFixturePath('subdir'), 0x1ed);
        fs.mkdirSync(getFixturePath('subdir/dir'), 0x1ed);
        delay(function() {
          watcher = chokidar.watch(fixturesPath, options).on('addDir', spy);
          delay(function(){
            spy.should.have.been.calledThrice;
            done();
          });
        });
      });
    });
    describe('ignored', function() {
      after(function() { delete options.ignored; });
      it('should check ignore after stating', function(done) {
        var testDir = getFixturePath('subdir');
        var spy = sinon.spy();
        fs.mkdirSync(testDir, 0x1ed);
        fs.writeFileSync(testDir + '/add.txt', '');
        fs.mkdirSync(testDir + '/dir', 0x1ed);
        fs.writeFileSync(testDir + '/dir/ignored.txt', '');
        function ignoredFn(path, stats) {
          if (path === testDir || !stats) return false;
          return stats.isDirectory();
        }
        options.ignored = ignoredFn;
        var watcher = chokidar.watch(testDir, options).on('add', spy);
        delay(function() {
          watcher.close();
          spy.should.have.been.calledOnce;
          spy.should.have.been.calledWith(sysPath.join(testDir, 'add.txt'));
          done();
        });
      });
      it('should not choke on an ignored watch path', function(done) {
        options.ignored = function() { return true; };
        var watcher = chokidar.watch(fixturesPath, options);
        delay(done);
      });
    });
    describe('depth', function() {
      beforeEach(function(done) {
        try{ fs.mkdirSync(getFixturePath('subdir'), 0x1ed); } catch(err){}
        try{ fs.mkdirSync(getFixturePath('subdir/dir'), 0x1ed); } catch(err){}
        try{ fs.writeFileSync(getFixturePath('subdir/add.txt'), 'b'); } catch(err){}
        try{ fs.writeFileSync(getFixturePath('subdir/dir/ignored.txt'), 'b'); } catch(err){}
        delay(done);
      });
      afterEach(function(){
        try{ fs.unlinkSync(getFixturePath('link')); } catch(err){}
      });
      after(function() {
        delete options.depth;
        delete options.ignoreInitial;
      });
      it('should not recurse if depth is 0', function(done) {
        options.depth = 0;
        var spy = sinon.spy();
        var watcher = chokidar.watch(fixturesPath, options).on('all', spy);
        delay(function() {
          fs.writeFileSync(getFixturePath('subdir/add.txt'), 'c');
          delay(function() {
            watcher.close();
            spy.should.have.been.calledWith('addDir', fixturesPath);
            spy.should.have.been.calledWith('addDir', getFixturePath('subdir'));
            spy.should.have.been.calledWith('add', getFixturePath('change.txt'));
            spy.should.have.been.calledWith('add', getFixturePath('unlink.txt'));
            spy.should.not.have.been.calledWith('change');
            spy.callCount.should.equal(4);
            done();
          });
        });
      });
      it('should recurse to specified depth', function(done) {
        options.depth = 1;
        var spy = sinon.spy();
        delay(function() {
          var watcher = chokidar.watch(fixturesPath, options).on('all', spy);
          ddelay(function() {
            fs.writeFileSync(getFixturePath('change.txt'), 'c');
            fs.writeFileSync(getFixturePath('subdir/add.txt'), 'c');
            fs.writeFileSync(getFixturePath('subdir/dir/ignored.txt'), 'c');
            ddelay(function() {
              watcher.close();
              spy.should.have.been.calledWith('addDir', getFixturePath('subdir/dir'));
              spy.should.have.been.calledWith('change', getFixturePath('change.txt'));
              spy.should.have.been.calledWith('change', getFixturePath('subdir/add.txt'));
              spy.should.not.have.been.calledWith('add', getFixturePath('subdir/dir/ignored.txt'));
              spy.should.not.have.been.calledWith('change', getFixturePath('subdir/dir/ignored.txt'));
              if (os === 'darwin' && (options.useFsEvents || options.usePolling)) {
                spy.callCount.should.equal(8);
              }
              done();
            });
          });
        });
      });
      it('should respect depth setting when following symlinks', function(done) {
        if (os === 'win32') return done(); // skip on windows
        options.depth = 1;
        var spy = sinon.spy();
        fs.symlinkSync(getFixturePath('subdir'), getFixturePath('link'));
        delay(function() {
          var watcher = chokidar.watch(fixturesPath, options).on('all', spy);
          ddelay(function() {
            watcher.close();
            spy.should.have.been.calledWith('addDir', getFixturePath('link'));
            spy.should.have.been.calledWith('addDir', getFixturePath('link/dir'));
            spy.should.have.been.calledWith('add', getFixturePath('link/add.txt'));
            spy.should.not.have.been.calledWith('add', getFixturePath('link/dir/ignored.txt'));
            done();
          });
        });
      });
      it('should respect depth setting when following a new symlink', function(done) {
        if (os === 'win32') return done(); // skip on windows
        options.depth = 1;
        options.ignoreInitial = true;
        var spy = sinon.spy();
        delay(function() {
          var watcher = chokidar.watch(fixturesPath, options).on('all', spy);
          ddelay(function() {
            fs.symlinkSync(getFixturePath('subdir'), getFixturePath('link'));
            delay(function() {
              watcher.close();
              spy.should.have.been.calledWith('addDir', getFixturePath('link'));
              spy.should.have.been.calledWith('addDir', getFixturePath('link/dir'));
              spy.should.have.been.calledWith('add', getFixturePath('link/add.txt'));
              spy.should.have.been.calledThrice;
              done();
            });
          });
        });
      });
    });
  });

  describe('close', function() {
    before(function() {
      try {fs.unlinkSync(getFixturePath('add.txt'));} catch(err) {}
    });
    after(function() {
      this.watcher.close();
      try {fs.unlinkSync(getFixturePath('add.txt'));} catch(err) {}
    });
    it('should ignore further events on close', function(done) {
      var watcher = this.watcher = chokidar.watch(fixturesPath, options);
      var spy = sinon.spy();
      watcher.once('add', function() {
        watcher.once('add', function() {
          watcher.close();
          delay(function() {
            watcher.on('add', spy);
            fs.writeFileSync(getFixturePath('add.txt'), 'hello world');
            delay(function() {
              spy.should.not.have.been.called;
              done();
            });
          });
        });
      });
      fs.writeFileSync(getFixturePath('add.txt'), 'hello world');
      fs.unlinkSync(getFixturePath('add.txt'));
    });
  });
}

describe('is-binary', function() {
  var isBinary = chokidar.isBinaryPath;
  it('should be a function', function() {
    isBinary.should.be.a('function');
  });
  it('should correctly determine binary files', function() {
    isBinary('a.jpg').should.equal(true);
    isBinary('a.jpeg').should.equal(true);
    isBinary('a.zip').should.equal(true);
    isBinary('ajpg').should.equal(false);
    isBinary('a.txt').should.equal(false);
  });
});
