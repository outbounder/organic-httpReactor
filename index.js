var Organel = require("organic").Organel;
var url = require("url")
var path = require("path")
var glob = require("glob")
var _ = require("underscore")
var join = require("organic-alchemy").http.join
var chain = require("organic-alchemy").http.chain

module.exports = Organel.extend(function(plasma, dna){
  Organel.call(this, plasma, dna)
  this.reactions_cache = [];
  
  if(!this.config.reactions.extname)
    throw new Error(".reactions.extname not found")
  if(!this.config.reactions.root)
    throw new Error(".reactions.root not found")

  this.loadReactions()
  this.on(this.config.capture.type, this.reactToRequest)

  this.url_cache = {}
},{
  reactToRequest: function(incomingChemical, next){
    var self = this;

    var reaction = null;
    var url_key = incomingChemical.req.method+incomingChemical.req.url
    if(!this.url_cache[url_key]) {
      reaction = join(
        this.findReactions(this.config.startReactions),
        this.findReactions(incomingChemical),
        this.findReactions(this.config.endReactions))
      this.url_cache[url_key] = reaction
    } else
      reaction = this.url_cache[url_key]

    reaction(incomingChemical, function(c){
      if(c.err)
        chain(self.findReactions(self.config.exceptionReactions))(c, next)
    })
  },
  findReactions: function(c){
    if(!c) return []

    var self = this;

    if(c.length) { // array of reaction modules
      return _.map(_.clone(c), function(definition){
        if(definition.source){
          var fn = require(path.join(process.cwd(),definition.source))
          if(fn.init)
            return fn.init(self.plasma, definition, "/")
          if(definition.arguments)
            return fn.apply(fn, definition.arguments)
          if(fn.length == 2)
            return fn(self.plasma, self.config)
          else
            return fn(self.config)
        } else{
          var fn = require(path.join(process.cwd(),definition))
          if(fn.length == 1)
            return fn(self.config)
          else
            return fn
        }
      })
    }

    if(c.type == this.config.capture.type && c.req && c.res) { // request chemical
      var matchingReactions = []
      var parsed_url = url.parse(c.req.url)
      var url_path = parsed_url.path; // /something/123123fjkslfj12/asd/12333.asd121
      for(var i = 0; i<this.reactions_cache.length; i++){
        if(url_path.indexOf(this.reactions_cache[i].url) === 0){
          matchingReactions.push(this.reactions_cache[i])
        }
      }
      return matchingReactions
    }

    return [] // default is empty
  },
  loadReactions: function(){
    var self = this;
    glob(this.config.reactions.root+"/**/*"+this.config.reactions.extname, function(err, files){
      if(err) {console.error(err); throw err}
      files.forEach(function(reactionFile){
        try {
          var reaction = require(path.join(process.cwd(),reactionFile))
          var reactionUrl = reactionFile
              .replace(self.config.reactions.root, "")
              .replace(self.config.reactions.extname, "")
              .replace(self.config.reactions.indexname, "")
          if(reaction.init)
            reaction = reaction.init(self.plasma, self.config, reactionUrl)
          if(!reaction.url)
            reaction.url = reactionUrl
          self.reactions_cache.push(reaction)
        } catch(err){
          console.error(err.stack)
        }
      })
    })
  }
})