const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const glob = require("glob");
const fse = require("fs-extra");
const gulp = require("gulp");
const logger = require("gulplog");
const sassdoc = require("sassdoc");
const baka = require("@joneff/baka");
const { parse } = require('sass-variable-parser');
const nodeSass = require("node-sass");
const dartSass = require("sass");
const autoprefixer = require("autoprefixer");
const calc = require("postcss-calc");

const { buildAll } = require('./scripts/sass-build');
const { flattenAll } = require('./scripts/sass-flatten');
const { getArg } = require("./scripts/utils");


// Settings
const paths = {
    sass: {
        all: "./packages/*/scss/**/*.scss",
        assets: "./packages/*/scss/**/*.{png,gif,ttf,woff}",
        themes: "./packages/!(theme-tasks)",
        theme: "./scss/all.scss",
        swatches: "./scss/swatches/!(_)*.scss",
        inline: "./dist/all.scss",
        dist: "./dist"
    }
};

const postcssPlugins = [
    calc({
        precision: 10
    }),
    autoprefixer()
];


// #region assets
gulp.task("assets", function() {
    let files = glob.sync(paths.sass.assets);
    let embedFile = require('./scripts/sass-assets');

    files.forEach(function(filename) {
        logger.info(`Converting asset to data URI: ${filename}`);
        embedFile(filename);
    });

    return Promise.resolve();
});
// #endregion


// #region node-sass
gulp.task("sass", function( done ) {
    let file = getArg('--file') || paths.sass.theme;
    let dest = getArg('--dest') || paths.sass.dist;
    let themes = glob.sync( getArg('--theme') || paths.sass.themes );

    buildAll( file, dest, { cwds: themes, compiler: nodeSass, postcssPlugins: postcssPlugins } );

    done();
});

gulp.task("sass:watch", function() {
    gulp.watch(paths.sass.all, gulp.series("sass"));
});

gulp.task("sass:swatches", function( done ) {
    let file = getArg('--file') || paths.sass.theme;
    let dest = getArg('--dest') || paths.sass.dist;
    let themes = glob.sync( getArg('--theme') || paths.sass.themes );
    let swatches = paths.sass.swatches;

    flattenAll( file, dest, { cwds: themes } );
    buildAll( swatches, dest, { cwds: themes, compiler: nodeSass, postcssPlugins: postcssPlugins } );

    done();
});

gulp.task("sass:flat", function( done ) {
    let file = getArg('--file') || paths.sass.theme;
    let dest = getArg('--dest') || paths.sass.dist;
    let themes = glob.sync( getArg('--theme') || paths.sass.themes );
    let inline = paths.sass.inline;

    flattenAll( file, dest, { cwds: themes } );
    buildAll( inline, dest, { cwds: themes, compiler: nodeSass, postcssPlugins: postcssPlugins } );

    done();
});
// #endregion


// #region dart-sass
gulp.task("dart", function( done ) {
    let file = getArg('--file') || paths.sass.theme;
    let dest = getArg('--dest') || paths.sass.dist;
    let themes = glob.sync( getArg('--theme') || paths.sass.themes );

    buildAll( file, dest, { cwds: themes, compiler: dartSass, postcssPlugins: postcssPlugins } );

    done();
});

gulp.task("dart:watch", function() {
    gulp.watch(paths.sass.all, gulp.series("dart"));
});

gulp.task("dart:swatches", function( done ) {
    let file = getArg('--file') || paths.sass.theme;
    let dest = getArg('--dest') || paths.sass.dist;
    let themes = glob.sync( getArg('--theme') || paths.sass.themes );
    let swatches = paths.sass.swatches;

    flattenAll( file, dest, { cwds: themes } );
    buildAll( swatches, dest, { cwds: themes, compiler: dartSass, postcssPlugins: postcssPlugins } );

    done();
});

gulp.task("dart:flat", function( done ) {
    let file = getArg('--file') || paths.sass.theme;
    let dest = getArg('--dest') || paths.sass.dist;
    let themes = glob.sync( getArg('--theme') || paths.sass.themes );
    let inline = paths.sass.inline;

    flattenAll( file, dest, { cwds: themes } );
    buildAll( inline, dest, { cwds: themes, compiler: dartSass, postcssPlugins: postcssPlugins } );

    done();
});
// #endregion


// #region docs
gulp.task("docs", function() {
    let themes = glob.sync(paths.sass.themes);

    return Promise.all(
        themes.map( theme => {

            if (fs.existsSync(path.join(theme, ".sassdocrc")) === false) {
                return Promise.resolve();
            }

            let sassdocrc = JSON.parse( fs.readFileSync( path.join(theme, ".sassdocrc"), "utf8" ) );
            return sassdoc(theme + "/scss/**/*.scss", {
                dest: path.join(theme, "/.tmp/docs"),
                dist: path.join(theme, "/docs"),
                theme: "./docs/sassdoc-theme.js",
                meta: sassdocrc.meta,
                groups: {
                    "color-system": "Color System",
                    "typography": "Typography",
                    "charts": "Charts",
                    "undefined": "Common"
                }
            });
        })
    );
});
gulp.task("docs:check", function() {
    //git diff --exit-code --quiet -- docs/
    return gulp.task("docs")().then(function() {
        let status = cp.spawnSync("git", [ "diff", "--exit-code", "--quiet", "--", "**/docs/*" ]) .status;

        if (status !== 0) {
            throw new Error("Docs are out of date");
        }
    });
});
// #endregion


gulp.task("resolve-vars", function() {
    let themes = glob.sync(paths.sass.themes);
    const cwd = process.cwd();

    themes.forEach( theme => {
        let variablesJson = path.resolve( cwd, `${theme}/.tmp/variables.json` );
        let variablesScss = path.resolve( cwd, `${theme}/.tmp/variables.scss` );

        fse.ensureFileSync( variablesJson );
        fse.ensureFileSync( variablesScss );

        baka.compile(
            path.join( cwd, `${theme}/scss/_variables.scss` ),
            variablesScss,
            {
                nodeModules: `${theme}/node_modules`
            }
        );

        let content = fs.readFileSync( variablesScss, 'utf-8' );

        content = content.replace(/ url\("data.*?\)/g, 'none');
        content = content.replace(/\/\/.*/gm, '');
        content = content.replace(/\n/gm, '');
        content = content.replace(/;/gm, ';\n');

        const variables = parse( content, { camelCase: false } );

        fs.writeFileSync( variablesJson, JSON.stringify( variables, null, 4 ) );

    });

    return Promise.resolve();
});
