var fs = require("fs");
var os = require("os");
var _ = require("lodash");
var async = require("async");
var dns = require("native-dns");
var request = require("request");
var child_process = require("child_process");

async.parallel({
    CLUSTER_LEADER: function(fn){
        var question = dns.Question({
          name: ["leaders", process.env.CS_CLUSTER_ID, "containership"].join("."),
          type: "A"
        });

        var req = dns.Request({
            question: question,
            server: { address: "127.0.0.1", port: 53, type: "udp" },
            timeout: 2000
        });

        req.on("timeout", function(){
            return fn();
        });

        req.on("message", function (err, answer) {
            var addresses = [];
            answer.answer.forEach(function(a){
                addresses.push(a.address);
            });

            return fn(null, _.first(addresses));
        });

        req.send();
    }
}, function(err, rabbitmq){
    _.merge(rabbitmq, process.env);

    _.defaults(rabbitmq, {
        ERLANG_COOKIE: "",
        DEFAULT_USER: "guest",
        DEFAULT_PASSWORD: "guest"
    });

    var options = {
        url: ["http:/", [rabbitmq.CLUSTER_LEADER, "8080"].join(":"), "v1", "hosts"].join("/"),
        method: "GET",
        json: true,
        timeout: 5000
    }

    async.waterfall([
        function(fn){
             fs.readFile("/etc/hosts", fn);
        },
        function(hosts_file, fn){
            var files = {};
            files.hosts = hosts_file.toString();

            request(options, function(err, response){
                if(err)
                    return fn(err);
                else if(response && response.statusCode != 200)
                    return fn(new Error("Received non-200 status code from leader!"));
                else{
                    var hosts = _.values(response.body);

                    hosts = _.filter(hosts, { mode: "follower" });

                    hosts = _.map(hosts, function(host){
                        return [host.address.private, host.host_name].join(" ");
                    });

                    files.hosts = _.flatten([files.hosts, hosts]).join("\n");

                    var conf = [
                        '[{rabbit, [',
                        ' {loopback_users, []},',
                        ' {cluster_nodes, {[ ',
                        _.map(hosts, function(host){
                            return ["'", "rabbit", "@", host.split(" ")[1], "'"].join("");
                        }).join(", "),
                        ' ], disc }},',
                        ' {default_user, <<"', rabbitmq.DEFAULT_USER, '">>},',
                        ' {default_pass, <<"', rabbitmq.DEFAULT_PASSWORD, '">>}',
                        ']}].'
                    ].join("");

                    files.conf = conf;

                    return fn(null, files);
                }
            });
        },
        function(files, fn){
            async.parallel([
                function(fn){
                    fs.writeFile("/etc/hosts", files.hosts, fn);
                },
                function(fn){
                    fs.writeFile("/etc/rabbitmq/rabbitmq.config", files.conf, fn);
                }
            ], fn);
        },
        function(config, fn){
            if(!_.isEmpty(rabbitmq.ERLANG_COOKIE))
                fs.writeFile("/var/lib/rabbitmq/.erlang.cookie", rabbitmq.ERLANG_COOKIE, { mode: "0600"}, function(err){
                    if(err)
                        return fn();

                    fs.chown("/var/lib/rabbitmq/.erlang.cookie", 101, 0, fn);
                });
            else
                return fn();
        }
    ], function(err){
        if(err){
            process.stderr.write(err.message);
            process.exit(1);
        }

        child_process.exec("rabbitmq-plugins enable --offline rabbitmq_management", function(err){
            if(err){
                process.stderr.write(err.message);
                process.exit(1);
            }

            var proc = child_process.spawn(["", "usr", "sbin", "rabbitmq-server"].join("/"));

            proc.stdout.pipe(process.stdout);
            proc.stderr.pipe(process.stderr);

            proc.on("error", function(err){
                process.stderr.write(err.message);
                process.exit(1);
            });
        });
    });

});
