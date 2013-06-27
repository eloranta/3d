/**
 * @fileoverview phoria - 3D Entity objects. Base class for chained matrix operations. Concrete Entity implementations.
 * @author Kevin Roast
 * @date 13th April 2013
 */

(function() {
   "use strict";
   
   /**
    * Constructor
    */
   Phoria.BaseEntity = function()
   {
      // the model matrix for this object - live manipulation functions below
      this.matrix = mat4.create();
      
      // children - child objects for the purposes of affine transformations - parent matrix applied first
      this.children = [];
      
      return this;
   };
   
   /**
    * Factory create method - object literal Entity descripton:
    * {
    *    matrix: mat4,
    *    children: [...],
    *    onScene: function() {...}
    * }
    */
   Phoria.BaseEntity.create = function(desc, e)
   {
      // merge structures to generate entity
      if (!e) e = new Phoria.BaseEntity();
      if (desc.matrix) e.matrix = desc.matrix;
      if (desc.children) e.children = desc.children;
      if (desc.onScene) e.onScene(desc.onScene);
      
      return e;
   };
   
   /**
    * The BaseEntity has functions to perform chained matrix operations and the child object list.
    */
   Phoria.BaseEntity.prototype =
   {
      children: null,
      matrix: null,
      
      onSceneHandlers: null,
      
      /**
       * Add an onScene event handler function to the entity
       * 
       * @param fn {function}    onScene handler signature: function(Phoria.Scene, time) this = Phoria.Entity
       */
      onScene: function onScene(fn)
      {
         if (this.onSceneHandlers === null) this.onSceneHandlers = [];
         this.onSceneHandlers.push(fn);
      },

      identity: function identity()
      {
         mat4.identity(this.matrix);
         return this;
      },

      invert: function invert()
      {
         mat4.invert(this.matrix, this.matrix);
         return this;
      },

      multiply: function multiply(m)
      {
         mat4.multiply(this.matrix, this.matrix, m);
         return this;
      },

      scale: function scale(vec)
      {
         mat4.scale(this.matrix, this.matrix, vec);
         return this;
      },

      scaleN: function scale(n)
      {
         mat4.scale(this.matrix, this.matrix, vec3.fromValues(n,n,n));
         return this;
      },

      rotate: function rotate(rad, axis)
      {
         mat4.rotate(this.matrix, this.matrix, rad, axis);
         return this;
      },

      rotateX: function rotateX(rad)
      {
         mat4.rotateX(this.matrix, this.matrix, rad);
         return this;
      },

      rotateY: function rotateY(rad)
      {
         mat4.rotateY(this.matrix, this.matrix, rad);
         return this;
      },

      rotateZ: function rotateZ(rad)
      {
         mat4.rotateZ(this.matrix, this.matrix, rad);
         return this;
      },

      translate: function translate(vec)
      {
         mat4.translate(this.matrix, this.matrix, vec);
         return this;
      },

      translateX: function translateX(n)
      {
         mat4.translate(this.matrix, this.matrix, vec3.fromValues(n,0,0));
         return this;
      },

      translateY: function translateY(n)
      {
         mat4.translate(this.matrix, this.matrix, vec3.fromValues(0,n,0));
         return this;
      },

      translateZ: function translateZ(n)
      {
         mat4.translate(this.matrix, this.matrix, vec3.fromValues(0,0,n));
         return this;
      },
      
      determinant: function determinant()
      {
         return mat4.determinant(this.matrix);
      },
      
      transpose: function transpose()
      {
         mat4.transpose(this.matrix, this.matrix);
         return this;
      }
   };
})();


var CLIP_ARRAY_TYPE = (typeof Uint32Array !== 'undefined') ? Uint32Array : Array;

(function() {
   "use strict";

   /**
    * Constructor
    */
   Phoria.Entity = function()
   {
      Phoria.Entity.superclass.constructor.call(this);
      
      this.points = [];
      this.edges = [];
      this.polygons = [];
      this.textures = [];
      
      // default rendering style
      this.style = {
         color: [128,128,128],
         specular: 0,
         drawmode: "solid",
         shademode: "lightsource",
         sortmode: "sorted",
         fillmode: "inflate",
         linewidth: 1.0,
         linescale: 0.0,
         hiddenangle: 0.0,
         doublesided: false
      };
      
      return this;
   };

   /**
    * Factory create method - object literal Entity descripton:
    * {
    *    matrix: mat4,
    *    children: [...],
    *    onScene: function() {...},
    *    
    *    points: [{x:0,y:0},...],
    *    edges: [{a:0,b:1},...],
    *    polygons: [{vertices:[7,8,10,9]},...],
    *    style: {
    *       color: [128,128,128],      // RGB colour of the object surface
    *       specular: 0,               // if not zero, specifies specular shinyness power - e.g. values like 16 or 64 (TBD)
    *       drawmode: "solid",         // one of "point", "wireframe", "solid"
    *       shademode: "lightsource",  // one of "plain", "lightsource", "sprite" (only for point rendering)
    *       sortmode: "sorted",        // one of "sorted", "unsorted"
    *       fillmode: "inflate",       // one of "fill", "filltwice", "inflate", "fillstroke", "hiddenline"
    *       linewidth: 1.0,            // wireframe line thickness
    *       linescale: 0.0,            // depth based scaling factor for wireframes - can be zero for no scaling
    *       hiddenangle: 0.0,          // hidden surface test angle - generally between -PI and 0
    *       doublesided: false
    *    }
    * }
    */
   Phoria.Entity.create = function(desc, e)
   {
      // merge structures to generate entity
      if (!e) e = new Phoria.Entity();
      Phoria.BaseEntity.create(desc, e);
      if (desc.points) e.points = desc.points;
      if (desc.polygons) e.polygons = desc.polygons;
      if (desc.edges) e.edges = desc.edges;
      if (desc.style) e.style = Phoria.Util.merge(e.style, desc.style);
      
      // generate normals - can call generate...() if manually changing points/polys at runtime
      e.generatePolygonNormals();
      // TODO: apply when gouraud shading for software rendering is added
      //e.generateVertexNormals();
      
      return e;
   };
   
   Phoria.Util.extend(Phoria.Entity, Phoria.BaseEntity, {
      points: null,
      edges: null,
      polygons: null,
      style: null,
      textures: null,
      
      _worldcoords: null,
      _coords: null,
      _vertexNormals: null,
      _worldVertexNormals: null,
      _clip: null,
      _averagez: 0,
      
      /**
       * Calculate and store the face normals for the entity
       */
      generatePolygonNormals: function generatePolygonNormals()
      {
         if (this.polygons)
         {
            // calculate normal vectors for face data - and set default colour
            // value if not supplied in the data set
            var points = this.points,
                polygons = this.polygons;
            for (var i=0, vertices, x1, y1, z1, x2, y2, z2; i<polygons.length; i++)
            {
               // First calculate normals from 3 points on the poly:
               // Vector 1 = Vertex B - Vertex A
               // Vector 2 = Vertex C - Vertex A
               vertices = polygons[i].vertices;
               x1 = points[vertices[1]].x - points[vertices[0]].x;
               y1 = points[vertices[1]].y - points[vertices[0]].y;
               z1 = points[vertices[1]].z - points[vertices[0]].z;
               x2 = points[vertices[2]].x - points[vertices[0]].x;
               y2 = points[vertices[2]].y - points[vertices[0]].y;
               z2 = points[vertices[2]].z - points[vertices[0]].z;
               // save the vec4 normal vector as part of the polygon data structure
               polygons[i].normal = Phoria.Util.calcNormalVector(x1, y1, z1, x2, y2, z2);

               // set poly specific texture to null if not applied
               if (polygons[i].texture === undefined)
               {
                  polygons[i].texture = null;
               }
            }
         }
      },
      
      /**
       * Calculate and store the vertex normals for the entity. Note! dependent on generatePolygonNormals()
       */
      generateVertexNormals: function generateVertexNormals()
      {
         if (this.polygons)
         {
            // For each vertex - find the polygons it is shared by
            // - examine each poly to find if it contains the vertex index.
            // NOTE: could optimize by sorting first? then only looking up/down the list a short distance?
            // Once we have list of vertex to polys, calculate the vertex normal by averaging the polygon normals
            // it is shared by - store this as the vertex normal.
            // Transform the vertex normals like other normals during the modelview processing.
            var points = this.points,
                polys = this.polygons,
                vertexToPoly = new Array(points.length);
            //for (var i=0; i<points.length; i++)
            //{
               for (var p=0,verts; p<polys.length; p++)
               {
                  verts = polys[p].vertices;
                  for (var v=0,vp; v<verts.length; v++)
                  {
                     //if (verts[v] === i)
                     //{
                        vp = vertexToPoly[verts[v]] || [];
                        vp.push(p);
                        vertexToPoly[verts[v]] = vp;
                        //(vertexToPoly[i] || []).push(p);
                        //break;
                     //}
                  }
               }
            //}
            var vertexNormals = new Array(points.length);
            for (var i=0,list; i<vertexToPoly.length; i++)
            {
               list = vertexToPoly[i];
               if (list)
               {
                  for (var p=0,nx=0,ny=0,nz=0,normal; p<list.length; p++)
                  {
                     normal = polys[p].normal;
                     nx += normal[0];
                     ny += normal[1];
                     nz += normal[2];
                  }
                  nx /= list.length;
                  ny /= list.length;
                  nz /= list.length;
                  // TODO: normalize again?
                  vertexNormals[i] = vec4.fromValues(nx,ny,nz,0);
               }
            }
            this._vertexNormals = vertexNormals;
         }
      },
      
      initCoordinateBuffers: function initCoordinateBuffers()
      {
         var len = this.points.length;
         if (this._worldcoords === null || this._worldcoords.length < len)
         {
            this._worldcoords = this.populateBuffer(len, function() {return vec4.create()});
         }
         if (this._coords === null || this._coords.length < len)
         {
            this._coords = this.populateBuffer(len, function() {return vec4.create()});
         }
         if (this._worldVertexNormals === null || this._worldVertexNormals.length < len)
         {
            this._worldVertexNormals = this.populateBuffer(len, function() {return vec4.create()});
         }
         if (this._clip === null || this._clip.length < len)
         {
            this._clip = new CLIP_ARRAY_TYPE(len);
         }
      },
      
      populateBuffer: function populateBuffer(len, fnFactory)
      {
         var array = new Array(len);
         for (var i=0; i<len; i++)
         {
            array[i] = fnFactory();
         }
         return array;
      }
   });
})();


(function() {
   "use strict";
   
   Phoria.PositionalAspect = {};
   
   /**
    * The PositionalAspect has defines a prototype for objects that are not rendered but have a position in the scene.
    * Augment an object with this aspect to provide positional behaviour.
    */
   Phoria.PositionalAspect.prototype =
   {
      position: null,
      worldposition: null,
      
      updatePosition: function updatePosition(matLocal)
      {
         // update worldposition position of emitter by local transformation -> world
         var vec = vec4.fromXYZ(this.position, 1);
         vec4.transformMat4(vec, vec, matLocal);
         this.worldposition = vec;
      }
   };
})();


(function() {
   "use strict";

   /**
    * Constructor
    */
   Phoria.PhysicsEntity = function()
   {
      Phoria.PhysicsEntity.superclass.constructor.call(this);
      
      this.velocity = {x:0, y:0, z:0};
      this.position = {x:0, y:0, z:0};
      this._force = {x:0, y:0, z:0};
      this._acceleration = null;
      this.gravity = true;
      
      // add handler to apply physics etc.
      this.onScene(this.applyPhysics);
      
      return this;
   };
   
   /**
    * Factory create method - object literal Entity descripton:
    * {
    *    velocity: {x:0,y:0,z:0},
    *    position: {x:0,y:0,z:0}, // NOTE: position is not render data - just informational for scene callbacks etc.
    *    force: {x:0,y:0,z:0},
    *    gravity: boolean
    * }
    */
   Phoria.PhysicsEntity.create = function(desc)
   {
      // merge structures to generate entity
      var e = new Phoria.PhysicsEntity();
      Phoria.Entity.create(desc, e);
      if (desc.velocity) e.velocity = desc.velocity;
      if (desc.position) e.position = desc.position;
      if (desc.force) e._force = desc.force;
      if (desc.gravity) e.gravity = desc.gravity;
      
      return e;
   };
   
   Phoria.Util.extend(Phoria.PhysicsEntity, Phoria.Entity, {
      velocity: null,
      gravity: false,
      _force: null,
      _acceleration: null,
      
      /**
       * Apply an impluse force to the entity
       * @param f {Object} xyz tuple for the force direction
       */
      impulse: function impulse(f)
      {
         this._acceleration = f;
      },
      
      /**
       * Apply an constant force to the entity
       * @param f {Object} xyz tuple for the force direction
       */
      force: function force(f)
      {
         this._force = f;
      },
      
      applyPhysics: function applyPhysics(scene, matLocal, time)
      {
         // local transformation -> world
         this.updatePosition(matLocal);
         
         var tt = time * time;
         
         // apply impulse force
         if (this._acceleration)
         {
            this.velocity.x += (this._acceleration.x * tt);
            this.velocity.y += (this._acceleration.y * tt);
            this.velocity.z += (this._acceleration.z * tt);
            this._acceleration = null;
         }
         // apply constant force
         if (this._force)
         {
            this.velocity.x += (this._force.x * tt);
            this.velocity.y += (this._force.y * tt);
            this.velocity.z += (this._force.z * tt);
         }
         // apply constant gravity if activated
         if (this.gravity)
         {
            this.velocity.x += (Phoria.PhysicsEntity.GRAVITY.x * tt);
            this.velocity.y += (Phoria.PhysicsEntity.GRAVITY.y * tt);
            this.velocity.z += (Phoria.PhysicsEntity.GRAVITY.z * tt);
         }

         // apply current velocity to position
         this.translate(vec3.fromXYZ(this.velocity));
      }
   });
   Phoria.Util.augment(Phoria.PhysicsEntity, Phoria.PositionalAspect);
})();

/**
 * Constants
 */
Phoria.PhysicsEntity.GRAVITY = {x:0, y:-9.8, z:0};


(function() {
   "use strict";

   /**
    * Constructor
    */
   Phoria.EmitterEntity = function()
   {
      Phoria.EmitterEntity.superclass.constructor.call(this);

      this.position = {x:0,y:0,z:0};
      this.positionRnd = {x:0,y:0,z:0};
      this.velocity = {x:0,y:1,z:0};
      this.velocityRnd = {x:0,y:0,z:0};
      this.maximum = 1000;
      
      // default particle rendering style
      this.style = {
         color: [128,128,128],
         drawmode: "point",
         shademode: "plain",
         sortmode: "unsorted",
         linewidth: 5,
         linescale: 2
      };
      
      this._lastEmitTime = Date.now();
      
      // add handler to emit particles
      this.onScene(this.emitParticles);
      
      return this;
   };
   
   /**
    * Factory create method - object literal Entity descripton:
    * {
    *    position: {x:0,y:0,z:0},    // used as the start position for particles - default (0,0,0)
    *    positionRnd: {x:0,y:0,z:0}, // randomness to apply to the start position - default (0,0,0)
    *    rate: Number,               // particles per second to emit - default 0
    *    maximum: Number,            // maximum allowed particles (zero for unlimited) - default 1000
    *    velocity: {x:0,y:0,z:0},    // start velocity of the particle - default (0,0,0)
    *    velocityRnd: {x:0,y:0,z:0}, // randomness to apply to the velocity - default (0,0,0)
    *    lifetime: Number,           // lifetime in ms of the particle (zero for unlimited) - default 0
    *    lifetimeRnd: Number,        // lifetime randomness to apply - default 0
    *    style: {...}                // particle rendering style (@see Phoria.Entity)
    *    onParticle: function() {...}// particle create callback function
    * }
    */
   Phoria.EmitterEntity.create = function(desc)
   {
      // TODO: provide an emitter() function - which sets velocity onto the particle?
      // merge structures to generate entity
      var e = new Phoria.EmitterEntity();
      Phoria.BaseEntity.create(desc, e);
      if (desc.position) e.position = desc.position;
      if (desc.positionRnd) e.positionRnd = desc.positionRnd;
      if (desc.rate) e.rate = desc.rate;
      if (desc.maximum) e.maximum = desc.maximum;
      if (desc.velocity) e.velocity = desc.velocity;
      if (desc.velocityRnd) e.velocityRnd = desc.velocityRnd;
      if (desc.lifetime) e.lifetime = desc.lifetime;
      if (desc.lifetimeRnd) e.lifetimeRnd = desc.lifetimeRnd;
      if (desc.style) e.style = Phoria.Util.merge(e.style, desc.style);
      if (desc.onParticle) e.onParticle(desc.onParticle);
      
      return e;
   };
   
   Phoria.Util.extend(Phoria.EmitterEntity, Phoria.BaseEntity, {
      style: null,
      rate: 0,
      maximum: 0,
      velocity: null,
      velocityRnd: null,
      lifetime: 0,
      lifetimeRnd: 0,   
      _lastEmitTime: 0,
      onParticleHandlers: null,
      
      /**
       * Add an onParticle event handler function to the entity. Typically used to decorate or modify a particle
       * before it is added to the emitter child list and begins it's lifecycle.
       * 
       * @param fn {function}    onParticle handler signature: function(particle) this = Phoria.EmitterEntity
       */
      onParticle: function onParticle(fn)
      {
         if (this.onParticleHandlers === null) this.onParticleHandlers = [];
         this.onParticleHandlers.push(fn);
      },
      
      emitParticles: function emitParticles(scene, matLocal, time)
      {
         // update worldposition position of emitter by local transformation -> world
         this.updatePosition(matLocal);
         
         // TODO: currently this assumes all direct children of the emitter are particles
         //       if they are not - these calculation need to be changes to keep track...
         
         // clean up expired particles - based on lifetime
         var now = Date.now();
         for (var i=0, p; i<this.children.length; i++)
         {
            p = this.children[i];
            if (p._gravetime && now > p._gravetime)
            {
               // found a particle to remove
               this.children.splice(i, 1);
            }
         }
         
         // emit particle objects
         var since = now - this._lastEmitTime;
         var count = Math.floor((this.rate / 1000) * since);
         if (count > 0)
         {
            // emit up to count value - also checking maximum to ensure total particle count
            for (var c=0; c<count && (this.maximum === 0 || this.children.length < this.maximum); c++)
            {
               var pos = {x:this.position.x, y:this.position.y, z:this.position.z};
               pos.x += (Math.random() * this.positionRnd.x) - (this.positionRnd.x * 0.5);
               pos.y += (Math.random() * this.positionRnd.y) - (this.positionRnd.y * 0.5);
               pos.z += (Math.random() * this.positionRnd.z) - (this.positionRnd.z * 0.5);
               var vel = {x:this.velocity.x, y:this.velocity.y, z:this.velocity.z};
               vel.x += (Math.random() * this.velocityRnd.x) - (this.velocityRnd.x * 0.5);
               vel.y += (Math.random() * this.velocityRnd.y) - (this.velocityRnd.y * 0.5);
               vel.z += (Math.random() * this.velocityRnd.z) - (this.velocityRnd.z * 0.5);
               
               // create particle directly - avoid overhead of friendly factory method
               var particle = new Phoria.PhysicsEntity();
               particle.points = [ pos ];
               particle.velocity = vel;
               particle.style = this.style;
               particle._gravetime = Math.floor(now + this.lifetime + (this.lifetimeRnd * Math.random()) - this.lifetimeRnd*0.5);
               
               // execute any callbacks interested in the particle creation
               if (this.onParticleHandlers !== null)
               {
                  for (var h in this.onParticleHandlers)
                  {
                     this.onParticleHandlers[h].call(this, particle);
                  }
               }
               
               this.children.push(particle);
            }
            this._lastEmitTime = now;
         }
      }
   });
   Phoria.Util.augment(Phoria.EmitterEntity, Phoria.PositionalAspect);
})();


(function() {
   "use strict";

   /**
    * Constructor
    */
   Phoria.BaseLight = function()
   {
      Phoria.BaseLight.superclass.constructor.call(this);
      
      this.color = [1.0, 1.0, 1.0];
      this.intensity = 1.0;
      
      return this;
   };
   
   Phoria.Util.extend(Phoria.BaseLight, Phoria.BaseEntity, {
      // colour rgb - note light component levels are from 0.0 - 1.0
      color: null,
      
      // light intensity 0.0-1.0
      intensity: 0.0
   });
})();


(function() {
   "use strict";

   /**
    * Constructor
    */
   Phoria.DistantLight = function()
   {
      Phoria.DistantLight.superclass.constructor.call(this);
      
      this.direction = {x:0, y:0, z:1};
      
      // add scene handler to transform the light direction into world direction
      this.onScene(this.transformToScene);
      
      return this;
   };
   
   /**
    * Factory create method - object literal Light descripton
    */
   Phoria.DistantLight.create = function(desc)
   {
      // merge structures to generate entity
      var e = new Phoria.DistantLight();
      Phoria.BaseEntity.create(desc, e);
      if (desc.color) e.color = desc.color;
      if (desc.intensity) e.intensity = desc.intensity;
      if (desc.direction) e.direction = desc.direction;
      
      return e;
   };
   
   Phoria.Util.extend(Phoria.DistantLight, Phoria.BaseLight, {
      // light direction
      direction: null,
      worlddirection: null,
      
      transformToScene: function transformToScene(scene, matLocal, time)
      {
         this.worlddirection = vec3.fromValues(
            -this.direction.x,
            -this.direction.y,
            -this.direction.z);
      }
   });
})();


(function() {
   "use strict";

   /**
    * Constructor
    */
   Phoria.PointLight = function()
   {
      Phoria.PointLight.superclass.constructor.call(this);
      
      this.position = {x: 0, y:0, z:-1};
      this.attenuation = 0.1;
      this.attenuationFactor = "linear";
      
      // add scene handler to transform the light position into world position
      this.onScene(this.transformToScene);
      
      return this;
   };
   
   /**
    * Factory create method - object literal Light descripton
    * {
    *    position: {x:0,y:0,z:0},
    *    color: [0-1,0-1,0-1],
    *    intensity: 0-1,
    *    attenuation: 0-1,
    *    attenuationFactor: "none"|"linear"|"squared"
    * }
    */
   Phoria.PointLight.create = function(desc)
   {
      // merge structures to generate entity
      var e = new Phoria.PointLight();
      Phoria.BaseEntity.create(desc, e);
      if (desc.color) e.color = desc.color;
      if (desc.intensity) e.intensity = desc.intensity;
      if (desc.position) e.position = desc.position;
      if (desc.attenuation) e.attenuation = desc.attenuation;
      if (desc.attenuationFactor) e.attenuationFactor = desc.attenuationFactor;
      
      return e;
   };
   
   Phoria.Util.extend(Phoria.PointLight, Phoria.BaseLight, {
      // falloff
      attenuation: 0,
      attenuationFactor: null,
      
      transformToScene: function transformToScene(scene, matLocal, time)
      {
         // update worldposition position of light by local transformation -> world
         this.updatePosition(matLocal);
      }
   });
   Phoria.Util.augment(Phoria.PointLight, Phoria.PositionalAspect);
})();