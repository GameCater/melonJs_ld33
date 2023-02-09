var screenHeight = 560;
var screenWidth = 960;
var goodEnd = true;

var LD33 = function() {

    /**
     * Start stuff when the page loads.
     */
    this.onload = function() {
        if ( !me.video.init( 'canvas', screenWidth, screenHeight ) ) {
            alert ("Yer browser be not workin");
        }

        // 启动自定义配置表
        this.options = {
            debug: true,
            skipIntro: true
        };

        window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
            this.options[key] = value;
        }.bind(this));

        // add "#debug" to the URL to enable the debug Panel
        if (this.options.debug) {
            me.plugin.register(debugPanel, "debug");
            me.plugin.debug.show();
        }
        if (this.options.mute) {
            me.audio.muteAll();
        }

        // 对象池注册对象构造
        me.pool.register( "player", Player );
        me.pool.register( "baddie", Mage);
        me.pool.register( "musketeer", Musketeer );
        me.pool.register( "mage", Mage );
        me.pool.register( "skeleton", Skeleton );
        me.pool.register( "civilian", Civilian );
        me.pool.register( "corpse", Corpse );
        me.pool.register( "grave", Grave );
        me.pool.register( "knight", Knight );
        me.pool.register( "pickup", Pickup );
        me.pool.register( "levelchanger", LevelChanger );
        me.pool.register( "gameender", GameEnder );

        me.input.preventDefault = true;

        me.audio.init ("m4a,ogg" );

        // Sync up post loading stuff.
        // 所有资源文件加载完成的回调
        me.loader.onload = this.loaded.bind( this );

        // 预加载所有资源
        me.loader.preload( GameResources );

        me.state.change( me.state.LOADING );

        document.getElementById("canvas").addEventListener('contextmenu', this.rightClickProxy.bind(this), false);


        return;
    };

    // 屏蔽右键呼出菜单
    this.rightClickProxy = function(e){
        if (e.button === 2) {
            e.preventDefault();
            return false;
        }
    }

    /**
     * Do stuff post-resource-load.
     */
    this.loaded = function() {

        // 场景绑定
        me.state.set( me.state.INTRO, new RadmarsScreen() );
        me.state.set( me.state.MENU, new TitleScreen() );
        me.state.set( me.state.PLAY, new PlayScreen() );
        me.state.set( me.state.GAMEOVER, new GameOverScreen() );

        // 触发PLAY state onResetEvent回调的执行
        me.state.change(this.options.skipIntro ? me.state.PLAY : me.state.INTRO);
    };
};


LD33.newBaddie = function(x, y, settings) {
    var classes = {
        'knight': 'Knight',
        'mage': 'Mage',
        'musketeer': 'Musketeer',
        'civilian': 'Civilian',
        'skeleton': 'Skeleton',
    };
    // #ProHacks
    // TODO
    return new window[classes[settings.unitType]](x, y, {
        zombie: settings.zombie,
        player: settings.player,

    });
};


LD33.data = {currentLevel:"", beatGame:false};


LD33.HUD = LD33.HUD || {};

LD33.HUD.Container = me.ObjectContainer.extend({
    init: function() {
        // call the constructor
        this.parent();

        this.isPersistent = false;
        this.collidable = false;

        this.boxDisplay = new LD33.HUD.BoxDisplay();

        // make sure our object is always draw first
        this.z = Infinity;
        this.name = "HUD";
    },

    // 加载HUD自动调用startGame
    startGame:function(){
        console.log("HUD start game");
        me.game.world.removeChild(this);
        this.removeChild(this.boxDisplay);
        this.boxDisplay.startGame();
        me.game.world.addChild(this);
        this.addChild(this.boxDisplay);
        me.game.world.sort(true);
    },

    endGame: function(){
        console.log("HUD end game");
        this.boxDisplay.endGame();
    }
});

LD33.HUD.BoxDisplay = me.Renderable.extend( {

    init: function() {

        // call the parent constructor
        // (size does not matter here)
        this.parent(new me.Vector2d(0, 0), 0, 0);
        this.alwaysUpdate = true;

        // create a font
        this.font = new me.BitmapFont("16x16_font", 16);
        //this.font.set("right");

        // 获取加载的资源引用
        this.box = me.loader.getImage("selectBox");
        this.hpBacking = me.loader.getImage("hp_bar_backing");
        this.hpAlly = me.loader.getImage("hp_bar_ally");
        this.hpBaddie = me.loader.getImage("hp_bar_baddie");
        this.unitSelected = me.loader.getImage("unit_selected");
        this.hudBackdrop = me.loader.getImage("hud");

        this.humansKilled1 = me.loader.getImage("humans_killed_1");
        this.humansKilled2 = me.loader.getImage("humans_killed_2");
        this.enterGate1 = me.loader.getImage("enter_gateway_1");
        this.enterGate2 = me.loader.getImage("enter_gateway_2");
        this.killHumans1 = me.loader.getImage("kill_all_humans_1");
        this.killHumans2 = me.loader.getImage("kill_all_humans_2");

        this.blinkTimer = 0;
        this.showHumansKilledTimer = 0;
        this.showStartTextTimer = 0;



        this.render = false;

        // make sure we use screen coordinates
        this.floating = true;

        this.mouseLeftDown = false;
        this.mouseDownPos = new me.Vector2d(0, 0);

        // enable the keyboard
        // 允许按住键盘O键的同时移动鼠标，效果等同于长按鼠标左键并移动
        me.input.bindKey(me.input.KEY.O, "proxy_mouse_left");
        me.input.bindPointer(me.input.KEY.O);
        me.input.bindPointer(me.input.mouse.LEFT, me.input.KEY.O);

       // me.input.bindKey(me.input.KEY.P, "proxy_mouse_right");
       // me.input.bindPointer(me.input.KEY.P);
       // me.input.bindPointer(me.input.mouse.RIGHT, me.input.KEY.P);

        this.rightClickAdded = false;
    },

    startGame: function(){
        this.render = true;

        this.blinkTimer = 0;
        this.showHumansKilledTimer = 100;
        this.showStartTextTimer = 100;
        this.moveMarker = new MoveTargetParticle(this.pos.x, this.pos.y);
        me.game.world.addChild(this.moveMarker);

        if( !this.rightClickAdded  ){
            console.log("[LD33.HUD.BoxDisplay](startGame) adding HUD rightclick proxy");
            this.rightClickAdded = true;
            document.getElementById("canvas").addEventListener('contextmenu', this.rightClick.bind(this), false);

        }

        /*
        var self = this
        new me.Tween(self.findGatePos).to({x:100}, 500).easing(me.Tween.Easing.Quintic.Out).delay(1000).onComplete(function(){
            new me.Tween(self.findGatePos).to({x:1000}, 1000).easing(me.Tween.Easing.Quintic.In).delay(2000).onComplete(function(){
                self.showFindGate = false;
            }).start();
        }).start();
        */
    },

    endGame: function(){
        this.render = false;
        if( this.rightClickAdded  ){
            console.log("[LD33.HUD.BoxDisplay](endGame) removing HUD rightclick proxy");
            this.rightClickAdded = false;
            document.getElementById("canvas").removeEventListener('contextmenu', this.rightClick.bind(this), false);
        }
    },

    rightClick: function(e){
        if (e.button === 2) {
            if(this.render){
                //console.log("right click");
                //me.input.mouse.pos.x - this.mouseDownPos.x, me.input.mouse.pos.y - this.mouseDownPos.y

                //console.log( "viewport " + me.game.viewport.pos.x +" , " + me.game.viewport.pos.y );

                var selected = 0;
                var x = me.input.mouse.pos.x + me.game.viewport.pos.x-16;
                var y = me.input.mouse.pos.y + me.game.viewport.pos.y-16;

                // 选中的玩家阵营怪物移动到鼠标右键点击位置
                me.state.current().playerArmy.forEach(function(target) {
                    if(target.selected){
                        target.moveToPos(x,y);
                        selected++;
                    }
                }.bind(this));

                // 播放右击定位动画
                if(this.moveMarker != null){
                    this.moveMarker.show(x,y);
                }
            }
        }
    },

    // 框选军队
    update : function () {
        if(!this.render) return;

        // 判断是否长按鼠标左键或者键盘O键
        if (me.input.isKeyPressed('proxy_mouse_left'))  {
            // 只记录第一次左击时
            if( !this.mouseLeftDown ){
                this.mouseLeftDown = true;

                console.log('点击时坐标');

                this.mouseDownPos.x = me.input.mouse.pos.x;
                this.mouseDownPos.y = me.input.mouse.pos.y;
            }

        }else{

            if( this.mouseLeftDown ){
                this.mouseLeftDown = false;

                console.log('松开左键后鼠标坐标');

                //start of box
                // 记录框选后方形左上角坐标（相对于viewport）
                var sx = this.mouseDownPos.x;
                var sy = this.mouseDownPos.y;

                // width and height
                var w = me.input.mouse.pos.x - this.mouseDownPos.x;
                var h = me.input.mouse.pos.y - this.mouseDownPos.y;

                //make inverse work
                if( w < 0){
                    sx += w;
                    w = Math.abs(w);
                }
                if( h < 0){
                    sy += h;
                    h = Math.abs(h);
                }

                //this is a hack to make a 'tiny box' for single click targeting.
                // 不用拉选框，直接点选一个
                if( w <= 4){ w = 16; sx-=8; };
                if( h <= 4 ){ h = 16; sy-=8; };

                // console.log("box! " + sx + " , " + sy + " / " + w + ", " + h);

                me.state.current().playerArmy.forEach(function(target) {

                    //box select
                    // 获得target对象距离当前camera2d viewport的坐标
                    var x = target.pos.x - me.game.viewport.pos.x + 16;
                    var y = target.pos.y - me.game.viewport.pos.y + 16;

                    // 判断target对象坐标是否在框选盒里
                    if( x > sx && x < sx + w && y > sy && y < sy + h ){
                        if(target.player != true){
                            target.selected = true;
                        }
                    }else{
                        target.selected = false;
                    }

                }.bind(this));
            }
        }

        return true;
    },

    draw : function (context) {
        if(!this.render)return;

        me.game.world.sort();

        // 给敌人画血条
        me.state.current().baddies.forEach(function(target) {
            var x = target.pos.x - me.game.viewport.pos.x;
            var y = target.pos.y - me.game.viewport.pos.y- 5;

            if(target.hp < target.maxHP){
                context.drawImage( this.hpBacking, x, y );
                if(target.hp > 0) context.drawImage( this.hpBaddie, x, y, 32 * (target.hp / target.maxHP), 4 );
            }
        }.bind(this));

        // 给自己人画血条以及选中效果
        me.state.current().playerArmy.forEach(function(target) {

            var x = target.pos.x - me.game.viewport.pos.x;
            var y = target.pos.y - me.game.viewport.pos.y- 5;

            if(target.hp < target.maxHP && target.hp > 0){
                context.drawImage( this.hpBacking, x, y );
                if(target.hp  > 0)  context.drawImage( this.hpAlly, x, y, 32 * (target.hp / target.maxHP), 4 );
            }

            if(target.selected){
                context.drawImage( this.unitSelected, x, y+5 );
            }
        }.bind(this));

        // 画框选盒
        if(this.mouseLeftDown){
            //this.mousePosLocal  = me.input.globalToLocal(me.input.mouse.pos.x, me.input.mouse.pos.y );

            //start of box
            var sx = this.mouseDownPos.x;
            var sy = this.mouseDownPos.y;

            // width and height
            var w = me.input.mouse.pos.x - this.mouseDownPos.x;
            var h = me.input.mouse.pos.y - this.mouseDownPos.y;

            //make inverse work
            if( w < 0){
                sx += w;
                w = Math.abs(w);
            }
            if( h < 0){
                sy += h;
                h = Math.abs(h);
            }

            //console.log( "mouse! " + (me.input.mouse.pos.x + me.game.viewport.pos.x)  + " , " +  (me.input.mouse.pos.y + me.game.viewport.pos.y) + " / player: " + player.pos.x + " , " + player.pos.y );
            //console.log( "mouse! " +  me.input.mouse.pos.x  + " , " +  me.input.mouse.pos.y );
            //var player = me.state.current().player;

            context.drawImage( this.box, sx, sy, w, h );
        }

        // 画hud(head-up display)
        context.drawImage( this.hudBackdrop, 0, 560-52 );
        this.font.draw (context,  me.state.current().baddies.length, 85, 560-25);
        this.font.draw (context,  me.state.current().playerArmy.length, 225, 560-25);


        this.blinkTimer++;
        if(this.blinkTimer >10){
            this.blinkTimer = 0;
        }

        // show_start_text_time: 100
        // 关卡提示的闪烁
        if(this.showStartTextTimer > 0){
            this.showStartTextTimer--;
            if(this.blinkTimer > 5){
                context.drawImage( this.killHumans1, 480 - 172, 560-250 );
            }else{
                context.drawImage( this.killHumans2, 480 - 172, 560-250 );
            }
        }

        if( me.state.current().baddies.length <= 0 ){
            //show humans killed message, then find exit message.

            this.showHumansKilledTimer--;
            if(this.showHumansKilledTimer > 0){
                if(this.blinkTimer > 5){
                    context.drawImage( this.humansKilled1, 480 - 220, 560-150 );
                }else{
                    context.drawImage( this.humansKilled2, 480 - 220, 560-150 );
                }
            }else{
                if(this.blinkTimer > 5){
                    context.drawImage( this.enterGate1, 480 - 75, 560-100 );
                }else{
                    context.drawImage( this.enterGate2, 480 - 75, 560-100 );
                }
            }
        }

    }
});


var LevelChanger = me.ObjectEntity.extend({
    init: function(x, y, settings) {
        this.toLevel = settings.toLevel;
        this.parent( x, y, {
            image: "gateway",
            spritewidth: 128,
            spriteheight: 128,
            width: settings.width,
            height: settings.height,
        });


        this.gravity = 0;
        this.collidable = true;

        this.alwaysUpdate = true;

        this.isOpen = false;
        this.renderable.addAnimation( "closed", [ 0 ] );
        this.renderable.addAnimation( "open", [ 1,2,3 ] );
        this.renderable.setCurrentAnimation("closed");
    },

    opened: function() {
        //hacks
        //return true;
        return me.state.current().baddies.length == 0;
    },

    update: function(dt) {
        this.parent(dt);
        this.updateMovement();

        this.z =  100 + this.pos.y * 0.1;

        if(!this.isOpen){
            if(this.opened()){
                this.isOpen = true;
                this.renderable.setCurrentAnimation("open");
                me.game.viewport.shake(8, 500);
                me.audio.play("gateopen");
            }
        }
    },

    onCollision: function(dir, obj) {
        if(obj.player && obj == me.state.current().player && this.opened()) {
            var l = this.toLevel;
            (function(){
                if(l == "end"){
                    me.state.change( me.state.GAMEOVER);
                }else{
                    me.state.current().goToLevel(l);
                }
            }).defer();
            me.audio.play("portalrev");
        }
    },
});

var GameEnder = me.ObjectEntity.extend({
    init: function(x, y, settings) {
        // TODO: Just bake image or attach to obj?
        settings.image = settings.image || 'pickup';
        settings.spritewidth =  69;
        settings.spriteheight = 117;
        this.toLevel = settings.toLevel;
        this.parent( x, y, settings );
        this.gravity = 0;
        this.collidable = true;
        this.flipX(true);
    },
    update: function(dt) {
        // TODO: Just bake image or attach to obj?
        this.parent(dt);
        this.updateMovement();

        me.game.world.collide(this, true).forEach(function(col) {
            if(col && col.obj == me.state.current().player  ) {
                LD33.data.collectedSouls += LD33.data.souls;
                LD33.data.souls = 0;
                me.state.current().endGame();
            }
        }, this);
    }
});

/** The game play state... */
var PlayScreen = me.ScreenObject.extend({
    init: function() {
        this.parent( true );
        this.HUD = new LD33.HUD.Container( );
        LD33.data.beatGame = false;
    },

    cleanTheShitUp: function( ){
        this.playerArmy = [];
        this.baddies = [];
        this.corpses = [];
    },

    endGame: function(){
        LD33.data.beatGame = true;
        me.state.change( me.state.GAMEOVER );
    },

    goToLevel: function( level ) {
        var self = this;
        this.cleanTheShitUp();
        me.game.reset();
        me.game.onLevelLoaded = function(l) {
            self.HUD.startGame();
            me.game.viewport.fadeOut( '#000000', 1000);
        };

        // 加载关卡1进关卡管理器
        me.levelDirector.loadLevel( level );

        // 不同关卡播放不同的bgm
        if (level === "level1") {
            me.audio.play("rise");
            me.audio.stopTrack();
            me.audio.playTrack("ld33-1", 0.5);
        }
        else if (level === "level6") {
            me.audio.stopTrack();
            me.audio.playTrack("ld33-2", 0.5);
        }
        else if (level === "level10") {
            me.audio.stopTrack();
            me.audio.playTrack("ld33-3", 0.5);
        }

        LD33.data.currentLevel=level;
    },

    getLevel: function() {
        return this.parseLevel( me.levelDirector.getCurrentLevelId() );
    },

    parseLevel: function( input ) {
        var re = /level(\d+)/;
        var results = re.exec( input );
        return results[1];
    },

    reloadLevel: function() {
        console.log("reloadLevel ");
        this.cleanTheShitUp();
        me.levelDirector.loadLevel( me.levelDirector.getCurrentLevelId() );
    },

    // this will be called on state change -> this
    // 状态切换时执行
    onResetEvent: function(newLevel) {
        console.log("onResetEvent " + newLevel );
        var self = this;
        LD33.data.beatGame = false;
        me.game.reset();

        var lev = LD33.data.currentLevel;
        if(lev == ""){
            lev = "level1";
        }

        var level =  newLevel || location.hash.substr(1) || lev ;

        this.goToLevel(level);
    },

    onDestroyEvent: function() {
        this.HUD.endGame();
    },
});


window.onReady(function() {
    window.app = new LD33();
    window.app.onload();
});
