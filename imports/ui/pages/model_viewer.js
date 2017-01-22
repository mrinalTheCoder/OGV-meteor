/**
/*               M O D E L _ V I E W E R . J S
 * BRL-CAD
 *
 * Copyright (c) 1995-2013 United States Government as represented by
 * the U.S. Army Research Laboratory.
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public License
 * version 2.1 as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
     * License along with this file; see the file named COPYING for more
 * information.
 */

/** @file OGV/client/views/model_viewer.js
 * Events, helpers and other logic required to render 3d models in
 * model Viewer.
 */

import './model_viewer.html'

import '../../utils/OBJloader.js'
import '../../utils/OrbitControls.js'
import '../../utils/Detector.js'
import Clipboard from '../../utils/clipboard.min.js'

import '../components/model_editor.js'

Template.modelViewer.events({
    'click #sm-item-love': function () {
        const love = {
            postId: this._id,
        }
        Meteor.call('love', love, (error) => {
            if (error) {
                sAlert.error(error.reason)
            }
        })
    },

    'click #sm-item-edit': function () {
        Router.current().render(Template.ModelViewer).data()
    },

    'click #sm-item-embed': function () {
        sAlert.success('Embed code has been copied to clipboard')
    },

    'click #sm-item-comment': function () {
        $('.comments-toolbar').removeClass('ec-inactive')
        $('.ec-model').addClass('ec-inactive')
        $('.edit-controls').toggleClass('edit-controls-hidden')
    },

    'click #comments-close-button': function () {
        $('#overlay-comments').css({
            bottom: '-10000px',
        })
    },

    'click #sm-item-owner': function () {
        ownerId()
    },
})

Template.modelViewer.helpers({
    embedCode() {
        const thisURL = `${Meteor.absoluteUrl()}models/${this._id}/shared=true`
        embedCode = `<iframe width="500" height="250" src="${thisURL}" frameborder="0"></iframe>`
        return embedCode
    },

    lovers() {
        loversObj = Lovers.findOne({
            postId: this._id,
        })
        if (loversObj) {
            loversArray = loversObj.lovers
            return loversArray.length
        }
        return 0
    },

    model() {
        return this.data
    },

    ownerId() {
        model = ModelFiles.findOne(this._id)
        return model.owner
    },

    ownerDp() {
        imgId = Meteor.users.findOne(model.owner).profile.pic
        if (imgId) {
            return ProfilePictures.findOne(imgId).url()
        }
        return '/icons/User.png'
    },
})

Template.modelViewer.rendered = function () {
    model = this.data
    objList = getObjFiles(model)
    console.log(`[model_viewer] Loading .obj files ${objList}`)
    clipboard = new Clipboard('#sm-item-embed')
    clipboard.on('success', (e) => {
        console.log('Action:', e.action)
        console.log('Text:', e.text)
        console.log('Trigger:', e.trigger)

        e.clearSelection()
    })

    clipboard.on('error', (e) => {
        console.log('Action:', e.action)
        console.log('Trigger:', e.trigger)
    })
    init()
    render()
}

/**
 * Get list of OBJ files for the current .g database
 */
function getObjFiles(model) {
    objUrls = []
    modelId = model._id
    OBJFiles.find({
        gFile: modelId,
    }).forEach((objFile) => {
        objUrls.push(objFile)
    })
    return objUrls
}

/**
 * 3D stuff
 */
let scene
let camera

/**
 * Initializes the model viewer
 */
function init() {
    /**
     * Setting Up the scene:
     * Grabs the model-container div from template into a variable
     * named container, and sets up the scene
     */
    const container = document.getElementById('model-container')
    const target = document.getElementById('main')

    /**
     * Create a scene, that will hold all our elements such
     * as objects, cameras and lights
     */
    scene = new THREE.Scene()

    /**
     * Create a camera, which defines where we're looking at.
     */
    camera = new THREE.PerspectiveCamera(65, target.clientWidth / target.clientHeight, 1, 100000)
    camera.position.z = 2000
    camera.position.x = 2000
    camera.position.y = 2000

    /**
     * Light up the scene
     */
    const ambient = new THREE.AmbientLight(0x555555)
    scene.add(ambient)

    const directionalLight = new THREE.PointLight(0xaaaaaa)
    directionalLight.position = camera.position
    scene.add(directionalLight)

    /** Axes */
    const axes = new THREE.AxisHelper(10000)
    scene.add(axes)

    /** Grid */
    const grid = new THREE.GridHelper(3000, 100)
    scene.add(grid)

    /**
     * Loader Managerial tasks
     */
    const manager = new THREE.LoadingManager()
    manager.onProgress = function (item, loaded, total) {
        console.log(`[model_viewer] Loading ${loaded}/${total} files`)
        animate()
    }

    /**
     * Adds the model to the viewer aka loads OBJ files
     * using OBJ-Loader
     */

    const group = new THREE.Object3D()
    const loader = new THREE.OBJLoader(manager)

    /**
     * Adds material to the model, which hence controls
     * how the model shall look
     */
    const OBJMaterialArray = []

    for (i in objList) {
        const OBJMaterial = new THREE.MeshPhongMaterial()
        OBJMaterialArray.push(OBJMaterial)
        loader.load(objList[i].url(), (object) => {
            object.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    colorhex = handleColorChange(objList[i].color)
                    colorhex = parseInt(colorhex, 16)
                    color = new THREE.Color(colorhex)
                    OBJMaterialArray[i].needsUpdate = true
                    OBJMaterialArray[i].color = color
                    child.material = OBJMaterialArray[i]
                }
            })

            object.position.y = 0.1

            group.add(object)
            scene.add(group)
        })
    }

    /**
     * If webgl is there then use it otherwise use canvas
     */
    if (Detector.webgl) {
        const pixelRatio = window.devicePixelRatio || 1
        renderer = new THREE.WebGLRenderer({
            antialias: false,
            preserveDrawingBuffer: true,
            devicePixelRatio: pixelRatio,
        })
    } else {
        console.warn('[model_viewer] WebGL not supported. Using canvas instead.')
        renderer = new THREE.CanvasRenderer()
    }

    /**
     * Sets size and color to renderer
     */
    renderer.setSize(target.clientWidth, target.clientHeight)
    renderer.setClearColor(0x555555, 1)
    container.appendChild(renderer.domElement)

    /**
     * orbitControls for zoom in/ zoom out and other basic controls
     */
    controls = new THREE.OrbitControls(camera, renderer.domElement)
    controls.addEventListener('change', render)

    window.addEventListener('resize', onWindowResize, false)
    window.addEventListener('keydown', onKeyDown, false)
}

/**
 * when window resizes, the size of modelviewer needs to resize
 */
function onWindowResize() {
    const target = document.getElementById('main')

    camera.aspect = target.clientWidth / target.clientHeight
    camera.updateProjectionMatrix()

    renderer.setSize(target.clientWidth, target.clientHeight)

    render()
}


function render() {
    renderer.render(scene, camera)
}

function animate() {
    requestAnimationFrame(render)
}

function handleColorChange(color) {
    if (typeof color === 'string') {
        color = color.replace('#', '0x')
    }
    return color
}

/**
 * onKeyDown function helps to view model from
 * different angles on keyboard button press.
 */
function onKeyDown(event) {
    switch (event.keyCode) {
    case 84:
            /* T */
        camera.position.set(0, 3000, 0) // top view
        camera.lookAt(scene.position)
        break
    case 66:
            /* B */
        camera.position.set(0, -3000, 0) // bottom view
        camera.lookAt(scene.position)
        break
    case 70:
            /* F */
        camera.position.set(-3000, 0, 0) // front view
        camera.lookAt(scene.position)
        break
    case 82:
            /* R */
        camera.position.set(3000, 0, 0) // rear view
        camera.lookAt(scene.position)
        break
    case 78:
            /* N */
        camera.position.set(2000, 2000, 2000) // Reset view using N
        camera.lookAt(scene.position)
        break
    default:
        break
    }
    animate()
}
