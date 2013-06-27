/**
 * @fileoverview phoria - Scene renderers. Canvas renderer and Software renderer.
 * @author Kevin Roast
 * @date 14th April 2013
 */

(function() {
   "use strict";

   /**
    * Object constructor
    */
   Phoria.Renderer = function()
   {
   };
   
   Phoria.Renderer.prototype = {
      sort: true,
   
      /**
       * Sort the list of objects in the scene by average Z coordinate. Prepares the flattened render
       * list to be rendered object by object using the painters algorithm.
       * 
       * @param scene {Phoria.Scene}
       */
      sortObjects: function sortObjects(scene)
      {
         // calculate and sort objects in average Z order
         if (this.sort)
         {
            for (var n=0; n<scene.renderlist.length; n++)
            {
               scene.renderlist[n]._averagez = 0;
            }
            scene.renderlist.sort(function sortObjectsZ(a, b) {
               if (a.style.sortmode === "sorted" && b.style.sortmode === "sorted")
               {
                  // ensure we have an average z coord for the objects to test
                  if (a._averagez === 0) a._averagez = Phoria.Util.averageObjectZ(a._coords);
                  if (b._averagez === 0) b._averagez = Phoria.Util.averageObjectZ(b._coords);
                  return (a._averagez < b._averagez ? 1 : -1);
               }
               else
               {
                  return (a.style.sortmode === "sorted" ? 1 : -1);
               }
            });
         }
      },

      /**
       * Calculate brightness for the normal based on a set of lights
       * 
       * @param position {vec3}  Position of the source polygon e.g. vertex or average poly point
       * @param normal {vec3}    Normal to calculate brightness for
       * @param lights {Array}   Array of light entities to 
       * @return RGB float component array for final brightness - values added to current values
       */
      calcNormalBrightness: function calcNormalBrightness(position, normal, lights)
      {
         var rgb = [0.0,0.0,0.0];
         for (var e=0, light, brightness; e<lights.length; e++)
         {
            light = lights[e];
            
            if (light instanceof Phoria.DistantLight)
            {
               // Distant lights have no "position" - they simply light the world with parallel rays from an
               // infinitely distant location - closest example is light from the sun when overhead
               // note that light worlddirection is precalculated as negative.
               brightness = vec3.dot(normal, light.worlddirection) * light.intensity;
            }
            else if (light instanceof Phoria.PointLight)
            {
               // Point lights have a position and a fall-off known as attenuation
               // distance falloff calculation - each light is additive to the total
               var vecToLight = vec3.subtract(vec3.create(), position, light.worldposition),
                   distance = vec3.length(vecToLight),
                   attenuation;
               vec3.normalize(vecToLight, vecToLight);
               var dotVP = vec3.dot(normal, vec3.negate(vecToLight, vecToLight));
               
               // don't waste any more time calculating if the dot product is negative i.e. > 90 degrees
               if (dotVP <= 0) continue;
               
               switch (light.attenuationFactor)
               {
                  default:
                  case "none":
                     attenuation = light.attenuation;
                     break;
                  case "linear":
                     attenuation = light.attenuation * distance;
                     break;
                  case "squared":
                     attenuation = light.attenuation * distance * distance;
                     break;
               }
               
               brightness = dotVP * light.intensity / attenuation;
            }
            
            // apply each colour component based on light levels (0.0 to 1.0)
            rgb[0] += brightness * light.color[0];
            rgb[1] += brightness * light.color[1];
            rgb[2] += brightness * light.color[2];
         }
         return rgb;
      },

      /**
       * Calculate brightness for the position based on a set of lights. It is assumed the entity at the position
       * has no normal vector i.e. it is a point in space only.
       * 
       * @param position {vec3}  Position of the source polygon e.g. vertex or average poly point
       * @param lights {Array}   Array of light entities to process
       * @return RGB float component array for final brightness - values added to current values
       */
      calcPositionBrightness: function calcPositionBrightness(position, lights)
      {
         var rgb = [0.0,0.0,0.0];
         for (var e=0, light, brightness; e<lights.length; e++)
         {
            light = lights[e];
            
            if (light instanceof Phoria.DistantLight)
            {
               // Distant lights have no "position"
               brightness = light.intensity;
            }
            else if (light instanceof Phoria.PointLight)
            {
               // Point lights have a position and a fall-off known as attenuation
               var vecToLight = vec3.subtract(vec3.create(), position, light.worldposition),
                   distance = vec3.length(vecToLight),
                   attenuation;
               vec3.normalize(vecToLight, vecToLight);
               
               switch (light.attenuationFactor)
               {
                  case "linear":
                     attenuation = light.attenuation * distance;
                     break;
                  case "squared":
                     attenuation = light.attenuation * distance * distance;
                     break;
                  default:
                  case "none":
                     attenuation = light.attenuation;
                     break;
               }
               
               // NOTE: increasing attenuation to try to light wires similar brightness to polygons that
               //       are lit by the same light - other options would be to properly calculate the lighting
               //       normal based on the polygons that share the edges - this would mean more complicated
               //       object descriptions - but provide much more accurate wireframe/point lighting...
               brightness = light.intensity / (attenuation * 2);
            }
            
            // apply each colour component based on light levels (0.0 to 1.0)
            rgb[0] += brightness * light.color[0];
            rgb[1] += brightness * light.color[1];
            rgb[2] += brightness * light.color[2];
         }
         return rgb;
      },

      inflatePolygon: function inflatePolygon(vertices, coords)
      {
         // generate vertices of parallel edges
         var pedges = [], inflatedVertices = new Array(vertices.length);
         for (var i=0, j=vertices.length, x1,y1,x2,y2,dx,dy,len; i<j; i++)
         {
            // collect an edge
            x1 = coords[vertices[i]][0];
            y1 = coords[vertices[i]][1];
            if (i < j - 1)
            {
               x2 = coords[vertices[i+1]][0];
               y2 = coords[vertices[i+1]][1];
            }
            else
            {
               x2 = coords[vertices[0]][0];
               y2 = coords[vertices[0]][1];
            }
            
            // compute outward facing normal vector - and normalise the length
            dx = y2 - y1;
            dy = -(x2 - x1);
            len = Math.sqrt(dx * dx + dy * dy);
            dx /= len;
            dy /= len;
            
            // multiply by the distance to the parallel edge
            dx *= 0.5;
            dy *= 0.5;
            
            // generate and store parallel edge
            pedges.push({x: x1 + dx, y: y1 + dy});
            pedges.push({x: x2 + dx, y: y2 + dy});
         }
         
         // calculate intersections to build new screen coords for inflated poly
         for (var i=0, j=vertices.length, vec; i<j; i++)
         {
            if (i === 0)
            {
               vec = this.intersection(pedges[(j-1) * 2], pedges[(j-1) * 2 + 1], pedges[0], pedges[1]);
            }
            else
            {
               vec = this.intersection(pedges[(i-1) * 2], pedges[(i-1) * 2 + 1], pedges[i * 2], pedges[i * 2 + 1]);
            }
            // handle edge case (haha) where inflated polygon vertex edges jump towards infinity
            if (Math.abs(vec[0] - coords[vertices[i]][0]) > 1.5 || Math.abs(vec[1] - coords[vertices[i]][1]) > 1.5)
            {
               // reset to original coordinates
               vec[0] = coords[vertices[i]][0];
               vec[1] = coords[vertices[i]][1];
            }
            inflatedVertices[i] = vec;
         }
         
         return inflatedVertices;
      },
      
      intersection: function intersection(line0v0, line0v1, line1v0, line1v1)
      {
         var a1 = line0v1.x - line0v0.x,
             b1 = line1v0.x - line1v1.x,
             c1 = line1v0.x - line0v0.x,
             a2 = line0v1.y - line0v0.y,
             b2 = line1v0.y - line1v1.y,
             c2 = line1v0.y - line0v0.y,
             t = (b1*c2 - b2*c1) / (a2*b1 - a1*b2);
         
         return [
            line0v0.x + t * (line0v1.x - line0v0.x),
            line0v0.y + t * (line0v1.y - line0v0.y)
         ];
      }
   };
})();


(function() {
   "use strict";

   /**
    * Object constructor
    */
   Phoria.CanvasRenderer = function(canvas)
   {
      Phoria.CanvasRenderer.superclass.constructor.call(this);

      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');

      return this;
   };
   
   Phoria.Util.extend(Phoria.CanvasRenderer, Phoria.Renderer, {
      // canvas to use as the output context
      canvas: null,
      ctx: null,
      
      /**
       * Render the given scene to the canvas context
       * 
       * @param {Phoria.Scene} scene   The scene to render - processed by scene.modelView()
       * @param {function} fnClear     Optional canvas clearing strategy function - otherwise clearRect() is used
       */
      render: function render(scene, fnClear)
      {
         this.sortObjects(scene);
         
         // clear the canvas before rendering begins - optional clearing function can be supplied
         var ctx = this.ctx;
         if (!fnClear)
         {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
         }
         else
         {
            fnClear.call(this, ctx);
         }
         
         // scene performs all local, world and projection calculations and flattens the rendering list ready for rendering.
         for (var n=0, obj; n<scene.renderlist.length; n++)
         {
            obj = scene.renderlist[n];

            ctx.save();
            if (obj.style.compositeOperation)
            {
               ctx.globalCompositeOperation = obj.style.compositeOperation;
            }
            switch (obj.style.drawmode)
            {
               case "solid":
               {
                  // ensure line width is set if appropriate fillmode is being used
                  if (obj.style.fillmode === "fillstroke" || obj.style.fillmode === "hiddenline") ctx.lineWidth = 1.0;
                  
                  // viewer position is used by polygon backface culling
                  var position = vec3.fromValues(
                     scene.camera.position.x,
                     scene.camera.position.y,
                     scene.camera.position.z);
                  
                  // render the pre-sorted polygons
                  for (var i=0; i<obj.polygons.length; i++)
                  {
                     this.renderPolygon(ctx, obj, obj.polygons[i], position, scene.lights);
                  }
                  break;
               }
               
               case "wireframe":
               {
                  ctx.lineWidth = obj.style.linewidth;
                  if (obj.style.shademode === "plain")
                  {
                     ctx.strokeStyle = "rgb(" + obj.style.color[0] + "," + obj.style.color[1] + "," + obj.style.color[2] + ")";
                     ctx.beginPath();
                     for (var i=0; i<obj.edges.length; i++)
                     {
                        this.renderEdge(ctx, obj, obj.edges[i], scene.lights);
                     }
                     ctx.closePath();
                     ctx.stroke();
                  }
                  else
                  {
                     for (var i=0; i<obj.edges.length; i++)
                     {
                        this.renderEdge(ctx, obj, obj.edges[i], scene.lights);
                     }
                  }
                  break;
               }
               
               case "point":
               {
                  var coords = obj._coords;
                  if (obj.style.shademode === "plain")
                  {
                     ctx.fillStyle = "rgb(" + obj.style.color[0] + "," + obj.style.color[1] + "," + obj.style.color[2] + ")";
                  }
                  for (var i=0; i<coords.length; i++)
                  {
                     this.renderPoint(ctx, obj, coords[i], i, scene.lights);
                  }
               }
            }
            ctx.restore();
         }
      },

      renderPoint: function renderPoint(ctx, obj, coord, index, lights)
      {
         // perform clip of point if vertex has been marked for clipping
         if (obj._clip[index]) return;
         
         var w = obj.style.linewidth;
         if (obj.style.linescale !== 0)
         {
            // use the perspective divisor to calculate line width scaling
            // TODO: adjust scaling factor against viewport size e.g. 16 not enough for small canvas...
            w = (obj.style.linewidth * obj.style.linescale) / ((obj._coords[index][3]) / 16);
         }

         switch (obj.style.shademode)
         {
            case "plain":
            {
               ctx.beginPath();
               ctx.arc(coord[0], coord[1], w, 0, TWOPI, true);
               ctx.closePath();
               ctx.fill();
               break;
            }
            case "sprite":
            {
               if (obj.style.sprite)
               {
                  ctx.drawImage(obj.style.sprite, coord[0]-w, coord[1]-w, w+w, w+w);
               }
               break;
            }
            case "lightsource":
            {
               // lighting calc
               var rgb = this.calcPositionBrightness(obj._worldcoords[index], lights);
               ctx.fillStyle = "rgb(" + Math.min(Math.ceil(rgb[0] * obj.style.color[0]),255) + "," +
                                        Math.min(Math.ceil(rgb[1] * obj.style.color[1]),255) + "," +
                                        Math.min(Math.ceil(rgb[2] * obj.style.color[2]),255) + ")";
               ctx.beginPath();
               ctx.arc(coord[0], coord[1], w, 0, TWOPI, true);
               ctx.closePath();
               ctx.fill();
               break;
            }
         }
      },
      
      renderEdge: function renderEdge(ctx, obj, edge, lights)
      {
         // perform clip of edge if all vertices have been marked for clipping
         if (obj._clip[edge.a] & obj._clip[edge.b]) return;
         
         var coords = obj._coords;
         
         if (obj.style.linescale !== 0)
         {
            // use the perspective divisor to calculate line width scaling
            ctx.lineWidth = (obj.style.linewidth * obj.style.linescale) / (((obj._coords[edge.a][3] + obj._coords[edge.b][3]) * 0.5) / 32);
         }

         // lighting calc
         if (obj.style.shademode === "lightsource")
         {
            var edgea = obj._worldcoords[edge.a], edgeb = obj._worldcoords[edge.b],
                position = vec3.fromValues((edgea[0] + edgeb[0]) * 0.5, (edgea[1] + edgeb[1]) * 0.5, (edgea[2] + edgeb[2]) * 0.5);
            var rgb = this.calcPositionBrightness(position, lights);
            ctx.beginPath();
            ctx.strokeStyle = "rgb(" + Math.min(Math.ceil(rgb[0] * obj.style.color[0]),255) + "," +
                                       Math.min(Math.ceil(rgb[1] * obj.style.color[1]),255) + "," +
                                       Math.min(Math.ceil(rgb[2] * obj.style.color[2]),255) + ")";
            // draw an edge
            ctx.moveTo(coords[edge.a][0], coords[edge.a][1]);
            ctx.lineTo(coords[edge.b][0], coords[edge.b][1]);
            ctx.closePath();
            ctx.stroke();
         }
         else
         {
            // draw an edge
            ctx.moveTo(coords[edge.a][0], coords[edge.a][1]);
            ctx.lineTo(coords[edge.b][0], coords[edge.b][1]);
         }
      },
      
      renderPolygon: function renderPolygon(ctx, obj, poly, position, lights)
      {
         var coords = obj._coords,
             clip = obj._clip,
             vertices = poly.vertices,
             color = poly.color ? poly.color : obj.style.color,
             fillStyle = null, rgb;
         
         // clip of poly if all vertices have been marked for clipping
         var clippoly = 1;
         for (var i=0; i<vertices.length; i++)
         {
            clippoly &= clip[vertices[i]];
         }
         if (clippoly) return;
         
         // hidden surface removal - viewer vector to surface normal
         if (!obj.style.doublesided && vec3.dot(position, poly._worldnormal) < obj.style.hiddenangle) return;
         
         // generate fill style based on lighting mode
         switch (obj.style.shademode)
         {
            case "plain":
            {
               if (poly.texture === null)
               {
                  fillStyle = color[0] + "," + color[1] + "," + color[2];
               }
               
               break;
            }
            
            case "lightsource":
            {
               // this performs a pass for each light - a simple linear-additive lighting model
               var rgb = this.calcNormalBrightness(Phoria.Util.averagePolyVertex(vertices, obj._worldcoords), poly._worldnormal, lights);

               // generate style string for canvas fill (integers in 0-255 range)
               fillStyle = Math.min(Math.ceil(rgb[0]*color[0]),255) + "," +
                           Math.min(Math.ceil(rgb[1]*color[1]),255) + "," +
                           Math.min(Math.ceil(rgb[2]*color[2]),255);
               
               break;
            }
         }
         
         // render the polygon - textured or one of the solid fill modes
         ctx.save();
         if (poly.texture !== null)
         {
            var bitmap = obj.textures[ poly.texture ];
            var fRenderTriangle = function(vs, sx0, sy0, sx1, sy1, sx2, sy2)
            {
               ctx.beginPath();
               ctx.moveTo(vs[0][0], vs[0][1]);
               for (var i=1, j=vs.length; i<j; i++)
               {
                  ctx.lineTo(vs[i][0], vs[i][1]);
               }
               ctx.closePath();
               ctx.clip();
               
               // Textured triangle transformation code originally by Thatcher Ulrich
               // TODO: figure out if drawImage goes faster if we specify the rectangle that bounds the source coords.
               // TODO: this is far from perfect - due to perspective corrected texture mapping issues see:
               //       http://tulrich.com/geekstuff/canvas/perspective.html
               var x0 = vs[0][0], y0 = vs[0][1],
                   x1 = vs[1][0], y1 = vs[1][1],
                   x2 = vs[2][0], y2 = vs[2][1];
               
               // collapse terms
               var denom = denom = 1.0 / (sx0 * (sy2 - sy1) - sx1 * sy2 + sx2 * sy1 + (sx1 - sx2) * sy0);
               // calculate context transformation matrix
               var m11 = - (sy0 * (x2 - x1) - sy1 * x2 + sy2 * x1 + (sy1 - sy2) * x0) * denom,
                   m12 = (sy1 * y2 + sy0 * (y1 - y2) - sy2 * y1 + (sy2 - sy1) * y0) * denom,
                   m21 = (sx0 * (x2 - x1) - sx1 * x2 + sx2 * x1 + (sx1 - sx2) * x0) * denom,
                   m22 = - (sx1 * y2 + sx0 * (y1 - y2) - sx2 * y1 + (sx2 - sx1) * y0) * denom,
                   dx = (sx0 * (sy2 * x1 - sy1 * x2) + sy0 * (sx1 * x2 - sx2 * x1) + (sx2 * sy1 - sx1 * sy2) * x0) * denom,
                   dy = (sx0 * (sy2 * y1 - sy1 * y2) + sy0 * (sx1 * y2 - sx2 * y1) + (sx2 * sy1 - sx1 * sy2) * y0) * denom;
               
               ctx.transform(m11, m12, m21, m22, dx, dy);
               
               // Draw the whole texture image. Transform and clip will map it onto the correct output polygon.
               ctx.drawImage(bitmap, 0, 0);
            };
            
            if (fillStyle !== null)
            {
               // convert RGB to grey scale level
               var alpha = rgb[0]*0.3 + rgb[1]*0.6 + rgb[2]*0.1;
               if (alpha > 1.0) alpha = 1.0;
               // fix to N decimal places to avoid eExp notation on toString()!
               ctx.fillStyle = "rgba(" + fillStyle + "," + (1.0 - alpha).toFixed(3) + ")";
            }
            
            // we can only deal with triangles for texturing - a quad must be split into two triangles
            // TODO: needs a triangle subdivision algorithm for > 4 verticies
            var inflatedVertices = this.inflatePolygon(vertices, coords);
            if (vertices.length === 3)
            {
               fRenderTriangle.call(this, inflatedVertices, 0, 0, bitmap.width, 0, bitmap.width, bitmap.height);
               // apply optionally fill style to shade and light the texture image
               if (fillStyle !== null)
               {
                  ctx.fill();
               }
            }
            else if (vertices.length === 4)
            {
               ctx.save();
               fRenderTriangle.call(this, inflatedVertices.slice(0, 3), 0, 0, bitmap.width, 0, bitmap.width, bitmap.height);
               ctx.restore();
               var v = new Array(3);
               v[0] = inflatedVertices[2];
               v[1] = inflatedVertices[3];
               v[2] = inflatedVertices[0];
               ctx.save();
               fRenderTriangle.call(this, v, bitmap.width, bitmap.height, 0, bitmap.height, 0, 0);
               ctx.restore();

               // apply optionally fill style to shade and light the texture image
               if (fillStyle !== null)
               {
                  ctx.beginPath();
                  ctx.moveTo(inflatedVertices[0][0], inflatedVertices[0][1]);
                  for (var i=1, j=inflatedVertices.length; i<j; i++)
                  {
                     ctx.lineTo(inflatedVertices[i][0], inflatedVertices[i][1]);
                  }
                  ctx.closePath();
                  ctx.fill();
               }
            }
         }
         else
         {
            if (obj.style.fillmode === "inflate")
            {
               // inflate the polygon screen coords to cover the 0.5 pixel cracks between canvas fill()ed polygons
               // see http://stackoverflow.com/questions/3749678/expand-fill-of-convex-polygon
               // and http://stackoverflow.com/questions/1109536/an-algorithm-for-inflating-deflating-offsetting-buffering-polygons
               var inflatedVertices = this.inflatePolygon(vertices, coords);
               ctx.beginPath();
               ctx.moveTo(inflatedVertices[0][0], inflatedVertices[0][1]);
               for (var i=1, j=vertices.length; i<j; i++)
               {
                  ctx.lineTo(inflatedVertices[i][0], inflatedVertices[i][1]);
               }
               ctx.closePath();
            }
            else
            {
               ctx.beginPath();
               // move to first point in the polygon
               ctx.moveTo(coords[vertices[0]][0], coords[vertices[0]][1]);
               for (var i=1; i<vertices.length; i++)
               {
                  // move to each additional point
                  ctx.lineTo(coords[vertices[i]][0], coords[vertices[i]][1]);
               }
               // no need to plot back to first point - as path closes shape automatically
               ctx.closePath();
            }
            
            fillStyle = "rgb(" + fillStyle + ")";
            switch (obj.style.fillmode)
            {
               case "fill":
                  // single fill - fastest but leaves edge lines
                  ctx.fillStyle = fillStyle;
                  ctx.fill();
                  break;
               
               case "filltwice":
                  // double fill causes "overdraw" towards edges - slightly slower
                  // but removes enough of the cracks for dense objects and small faces
                  ctx.fillStyle = fillStyle;
                  ctx.fill();
                  ctx.fill();
                  break;
               
               case "inflate":
                  // inflate (also called 'buffering') the polygon in 2D by a small ammount
                  // and then a single fill can be used - increase in pre calculation time
                  ctx.fillStyle = fillStyle;
                  ctx.fill();
                  break;
               
               case "fillstroke":
                  // single fill - followed by a stroke line - nicer edge fill but slower
                  ctx.fillStyle = fillStyle;
                  ctx.fill();
                  ctx.strokeStyle = fillStyle;
                  ctx.stroke();
                  break;
               
               case "hiddenline":
                  // stroke only - to produce hidden line wire effect
                  ctx.strokeStyle = fillStyle;
                  ctx.stroke();
                  break;
            }
         }
         ctx.restore();
      }
   });
})();


(function() {
   "use strict";

   /**
    * Object constructor
    */
   Phoria.SoftwareRenderer = function(canvas)
   {
      Phoria.SoftwareRenderer.superclass.constructor.call(this);

      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this._imagedata = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this._data = this._imagedata.data;

      return this;
   };
   
   Phoria.Util.extend(Phoria.SoftwareRenderer, Phoria.Renderer, {
      // canvas to use as the output context
      canvas: null,
      ctx: null,
      _imagedata: null,
      _data: null,
      
      /**
       * Render the given scene to the canvas context
       * 
       * @param {Phoria.Scene} scene   The scene to render - processed by scene.modelView()
       */
      render: function render(scene)
      {
         this.sortObjects(scene);
         
         // clear the canvas before rendering begins
         // TODO: optimize with prevrect - see SoftwareRenderer
         this.clearCanvasRect(0, 0, this.canvas.width, this.canvas.height);
         //this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
         //this._imagedata = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
         //this._data = this._imagedata.data;

         // scene performs all local, world and projection calculations and flattens the rendering list ready for rendering.
         for (var n=0, obj; n<scene.renderlist.length; n++)
         {
            obj = scene.renderlist[n];
            
            switch (obj.style.drawmode)
            {
               case "solid":
               {
                  // viewer position is used by polygon backface culling
                  var position = vec3.fromValues(
                     scene.camera.position.x,
                     scene.camera.position.y,
                     scene.camera.position.z);
                  
                  // render the pre-sorted polygons
                  var rendercount = 0;
                  for (var i=0; i<obj.polygons.length; i++)
                  {
                     if (this.renderPolygon(null, obj, obj.polygons[i], position, scene.lights)) rendercount++;
                  }
                  //if (Date.now() % 25 === 0) console.log(rendercount);
                  break;
               }
            }
         }

         // TODO: optimize with prev rect - see SoftwareRenderer
         this.ctx.putImageData(this._imagedata, 0, 0, 0, 0, this.canvas.width, this.canvas.height);
      },

      clearCanvasRect: function clearCanvasRect(xmin, ymin, xmax, ymax)
      {
         // TODO: optimize with prevrect - see SoftwareRenderer
         var offset = (xmin + ymin * this.canvas.width - 1) * 4 + 3,
             linestep = (this.canvas.width - (xmax - xmin)) * 4,
             data = this._data;
         for (var y = ymin; y < ymax; y++)
         {
            for (var x = xmin; x < xmax; x++)
            {
               data[offset += 4] = 0;
            }
            offset += linestep;
         }
      },
      
      renderPolygon: function renderPolygon(ctx, obj, poly, position, lights)
      {
         var coords = obj._coords,
             clip = obj._clip,
             vertices = poly.vertices,
             color = poly.color ? poly.color : obj.style.color;

         // clip of poly if all vertices have been marked for clipping
         var clippoly = 1;
         for (var i=0; i<vertices.length; i++)
         {
            clippoly &= clip[vertices[i]];
         }
         if (clippoly) return false;
         
         // hidden surface removal - viewer vector to surface normal
         if (!obj.style.doublesided && vec3.dot(position, poly._worldnormal) < obj.style.hiddenangle) return false;
         
         // generate fill style based on lighting mode
         var rgb;
         switch (obj.style.shademode)
         {
            case "plain":
            {
               rgb = new Array(3);
               rgb[0] = color[0];
               rgb[1] = color[1];
               rgb[2] = color[2];

               break;
            }
            
            case "lightsource":
            {
               // perform a pass for each light - a simple linear-additive lighting model
               rgb = this.calcNormalBrightness(Phoria.Util.averagePolyVertex(vertices, obj._worldcoords), poly._worldnormal, lights);

               // generate final RGB
               rgb[0] = Math.ceil(Math.min(rgb[0]*color[0], 255));
               rgb[1] = Math.ceil(Math.min(rgb[1]*color[1], 255));
               rgb[2] = Math.ceil(Math.min(rgb[2]*color[2], 255));
               
               break;
            }
         }
         
         // render a triangle in software to a buffer
         this.drawTriangle(
            coords[vertices[2]][0], coords[vertices[2]][1],
            coords[vertices[1]][0], coords[vertices[1]][1],
            coords[vertices[0]][0], coords[vertices[0]][1],
            rgb[0], rgb[1], rgb[2]);
         // handle quad - split into second triangle
         // TODO: polygon subvision is needed for >4 verts if this renderer is used...
         if (vertices.length === 4)
         {
            this.drawTriangle(
               coords[vertices[0]][0], coords[vertices[0]][1],
               coords[vertices[3]][0], coords[vertices[3]][1],
               coords[vertices[2]][0], coords[vertices[2]][1],
               rgb[0], rgb[1], rgb[2]);
         }
         return true;
      },

      drawTriangle: function drawTriangle(x1, y1, x2, y2, x3, y3, r, g, b)
      {
         // http://devmaster.net/forums/topic/1145-advanced-rasterization/

         // 28.4 fixed-point coordinates
         var x1 = Math.round( 16 * x1 ),
             x2 = Math.round( 16 * x2 ),
             x3 = Math.round( 16 * x3 ),
             y1 = Math.round( 16 * y1 ),
             y2 = Math.round( 16 * y2 ),
             y3 = Math.round( 16 * y3 );

         // Deltas
         var dx12 = x1 - x2,
             dx23 = x2 - x3,
             dx31 = x3 - x1,
             dy12 = y1 - y2,
             dy23 = y2 - y3,
             dy31 = y3 - y1;

         // Fixed-point deltas
         var fdx12 = dx12 << 4,
             fdx23 = dx23 << 4,
             fdx31 = dx31 << 4,
             fdy12 = dy12 << 4,
             fdy23 = dy23 << 4,
             fdy31 = dy31 << 4;

         var canvasWidth = this.canvas.width,
             canvasHeight = this.canvas.height,
             data = this._data;

         // Bounding rectangle
         var xmin = Math.max( ( Math.min( x1, x2, x3 ) + 0xf ) >> 4, 0 ),
             xmax = Math.min( ( Math.max( x1, x2, x3 ) + 0xf ) >> 4, canvasWidth ),
             ymin = Math.max( ( Math.min( y1, y2, y3 ) + 0xf ) >> 4, 0 ),
             ymax = Math.min( ( Math.max( y1, y2, y3 ) + 0xf ) >> 4, canvasHeight );
         
         if (xmax <= xmin || ymax <= ymin) return;

         //rectx1 = Math.min( xmin, rectx1 );
         //rectx2 = Math.max( xmax, rectx2 );
         //recty1 = Math.min( ymin, recty1 );
         //recty2 = Math.max( ymax, recty2 );

         // Constant part of half-edge functions
         var c1 = dy12 * x1 - dx12 * y1,
             c2 = dy23 * x2 - dx23 * y2,
             c3 = dy31 * x3 - dx31 * y3;

         // Correct for fill convention
         if ( dy12 < 0 || ( dy12 == 0 && dx12 > 0 ) ) c1++;
         if ( dy23 < 0 || ( dy23 == 0 && dx23 > 0 ) ) c2++;
         if ( dy31 < 0 || ( dy31 == 0 && dx31 > 0 ) ) c3++;

         var cy1 = c1 + dx12 * ( ymin << 4 ) - dy12 * ( xmin << 4 ),
             cy2 = c2 + dx23 * ( ymin << 4 ) - dy23 * ( xmin << 4 ),
             cy3 = c3 + dx31 * ( ymin << 4 ) - dy31 * ( xmin << 4 ),
             cx1, cx2, cx3;

         // Scan through bounding rectangle
         for (var y = ymin,x,offset; y < ymax; y++)
         {
            // Start value for horizontal scan
            cx1 = cy1;
            cx2 = cy2;
            cx3 = cy3;
            for (x = xmin; x < xmax; x++)
            {
               if (cx1 > 0 && cx2 > 0 && cx3 > 0)
               {
                  offset = (x + y * canvasWidth) << 2;
                  data[ offset ] = r;
                  data[ offset + 1 ] = g;
                  data[ offset + 2 ] = b;
                  data[ offset + 3 ] = 255;
               }
               cx1 -= fdy12;
               cx2 -= fdy23;
               cx3 -= fdy31;
            }
            cy1 += fdx12;
            cy2 += fdx23;
            cy3 += fdx31;
         }
      }
   });
})();